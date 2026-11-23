import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { conflict, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { NotificationsService } from '../communication/notifications.service.js';
import { FilesService, privateFileUrl } from '../files/files.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  FeedbackCategory,
  FeedbackStatus,
  FilePurpose,
  type Gender,
  NotificationEntity,
  NotificationType,
  Role,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StudentAccessService } from '../student-space/student-access.service.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';
import type {
  AdminFeedbackDto,
  AdminFeedbackListDto,
  AdminFeedbackQueryDto,
  CreateFeedbackDto,
  FeedbackDto,
  FeedbackListDto,
  UpdateFeedbackDto,
} from './feedback.dto.js';

type Tx = Prisma.TransactionClient;

/** Who may send: the workspace it is sent from (the role is checked by the controller). */
export type FeedbackSenderRole = typeof Role.TEACHER | typeof Role.STUDENT;

/** At most this many submissions per account and hour. */
export const FEEDBACK_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
/** The same submission again within this time (a double tap, a retried request) is the same one. */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  BUG: 'الإبلاغ عن مشكلة',
  IMPROVEMENT: 'اقتراح تحسين',
  OTHER: 'ملاحظة أخرى',
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  NEW: 'جديد',
  REVIEWING: 'قيد المراجعة',
  RESOLVED: 'تم الحل',
  CLOSED: 'مغلق',
};

const SENDER_TITLE: Record<FeedbackSenderRole, Record<Gender, string>> = {
  TEACHER: { MALE: 'المعلم', FEMALE: 'المعلمة' },
  STUDENT: { MALE: 'الطالب', FEMALE: 'الطالبة' },
};

const person = {
  select: {
    id: true,
    username: true,
    person: { select: { firstName: true, lastName: true, gender: true } },
  },
} as const;

const select = {
  id: true,
  createdByUserId: true,
  senderRole: true,
  category: true,
  title: true,
  description: true,
  status: true,
  platform: true,
  appVersion: true,
  screenPath: true,
  adminResponse: true,
  respondedAt: true,
  resolvedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  screenshot: { select: { id: true, mimeType: true, size: true } },
  createdBy: person,
  respondedBy: person,
} satisfies Prisma.FeedbackSelect;

type Row = Prisma.FeedbackGetPayload<{ select: typeof select }>;

const nameOf = (u: {
  id: string;
  username: string;
  person: { firstName: string; lastName: string };
}) => `${u.person.firstName} ${u.person.lastName}`.trim() || u.username;

function toDto(r: Row): FeedbackDto {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    description: r.description,
    status: r.status,
    screenshot: r.screenshot
      ? {
          id: r.screenshot.id,
          url: privateFileUrl(r.screenshot.id),
          mimeType: r.screenshot.mimeType,
          size: r.screenshot.size,
        }
      : null,
    response: r.adminResponse,
    respondedAt: r.respondedAt,
    resolvedAt: r.resolvedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    version: r.version,
  };
}

function toAdminDto(r: Row): AdminFeedbackDto {
  return {
    ...toDto(r),
    sender: { userId: r.createdBy.id, name: nameOf(r.createdBy) },
    senderRole: r.senderRole,
    respondedBy: r.respondedBy
      ? { userId: r.respondedBy.id, name: nameOf(r.respondedBy) }
      : null,
    platform: r.platform,
    appVersion: r.appVersion,
    screenPath: r.screenPath,
  };
}

const feedbackNotFound = () =>
  notFound('FEEDBACK_NOT_FOUND', 'الملاحظة غير موجودة');

/**
 * «الملاحظات والاقتراحات». A teacher or a student sends feedback about the application (the
 * sender is ALWAYS the authenticated account); they see their own only. The admins see all of it,
 * change its status and answer it. Notifications reuse NotificationsService: the admins on a new
 * submission, the sender when an admin really changed something (never for an identical save).
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly teacherAccess: TeacherAccessService,
    private readonly studentAccess: StudentAccessService,
  ) {}

  // ───────────────────────── teacher / student ─────────────────────────

  async create(
    userId: string,
    role: FeedbackSenderRole,
    dto: CreateFeedbackDto,
  ): Promise<FeedbackDto> {
    // An ACTIVE teacher / student profile behind the account (403 otherwise)
    if (role === Role.TEACHER) await this.teacherAccess.teacherIdOf(userId);
    else await this.studentAccess.scopeOf(userId);

    const id = await this.prisma.$transaction(async (tx) => {
      // One submission of an account at a time: the limit and the duplicate check are exact
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`feedback:${userId}`}, 0))) AS l`;
      const now = Date.now();
      const same = await tx.feedback.findFirst({
        where: {
          createdByUserId: userId,
          category: dto.category,
          title: dto.title,
          description: dto.description,
          createdAt: { gte: new Date(now - DUPLICATE_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (same) return same.id; // the same submission again: nothing new, nobody told twice
      const recent = await tx.feedback.count({
        where: {
          createdByUserId: userId,
          createdAt: { gte: new Date(now - RATE_WINDOW_MS) },
        },
      });
      if (recent >= FEEDBACK_RATE_LIMIT)
        throw new HttpException(
          {
            code: 'FEEDBACK_RATE_LIMITED',
            message:
              'أرسلت عددًا كبيرًا من الملاحظات خلال وقت قصير، يرجى المحاولة لاحقًا',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      if (dto.screenshotFileId)
        // Only an image THEY uploaded for feedback (another's file: FILE_NOT_FOUND)
        await this.files.assertAttachable(
          tx,
          dto.screenshotFileId,
          FilePurpose.FEEDBACK_SCREENSHOT,
          { userId, isAdmin: false },
          { kinds: ['IMAGE'] },
        );
      const created = await tx.feedback.create({
        data: {
          createdByUserId: userId,
          senderRole: role,
          category: dto.category,
          title: dto.title,
          description: dto.description,
          screenshotFileId: dto.screenshotFileId ?? null,
          platform: dto.platform ?? null,
          appVersion: dto.appVersion || null,
          screenPath: dto.screenPath || null,
        },
        select,
      });
      await this.notifications.notifyAdmins(tx, {
        type: NotificationType.FEEDBACK_SUBMITTED,
        entityType: NotificationEntity.FEEDBACK,
        entityId: created.id,
        title: 'ملاحظة جديدة',
        message: submittedMessage(created),
        actorUserId: userId,
      });
      return created.id;
    });
    return toDto(await this.row(id));
  }

  /** «ملاحظاتي»: the account's own submissions, newest first. */
  async listMine(
    userId: string,
    query: { page: number; pageSize?: number },
  ): Promise<FeedbackListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where = { createdByUserId: userId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  /** One of MY submissions (another's: 404 — never confirms it exists). */
  async getMine(userId: string, id: string): Promise<FeedbackDto> {
    const row = await this.prisma.feedback.findFirst({
      where: { id, createdByUserId: userId },
      select,
    });
    if (!row) throw feedbackNotFound();
    return toDto(row);
  }

  // ───────────────────────── admin ─────────────────────────

  async list(query: AdminFeedbackQueryDto): Promise<AdminFeedbackListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const term = query.search
      ? { contains: query.search, mode: 'insensitive' as const }
      : undefined;
    const where: Prisma.FeedbackWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(term
        ? {
            OR: [
              { title: term },
              { createdBy: { username: term } },
              { createdBy: { person: { firstName: term } } },
              { createdBy: { person: { lastName: term } } },
            ],
          }
        : {}),
    };
    const [total, newCount, rows] = await this.prisma.$transaction([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.count({ where: { status: FeedbackStatus.NEW } }),
      this.prisma.feedback.findMany({
        where,
        select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toAdminDto),
      meta: paginationMeta(query.page, pageSize, total),
      newCount,
    };
  }

  async get(id: string): Promise<AdminFeedbackDto> {
    return toAdminDto(await this.row(id));
  }

  /**
   * A status and / or the response. Nothing really changed (the same status, the same text):
   * nothing is written and nobody is told. Otherwise version + 1 and ONE notification to the
   * sender (a response removed alone is not announced).
   */
  async update(
    adminUserId: string,
    id: string,
    dto: UpdateFeedbackDto,
  ): Promise<AdminFeedbackDto> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM feedback WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.feedback.findUnique({
        where: { id },
        select: {
          status: true,
          adminResponse: true,
          version: true,
          title: true,
          createdByUserId: true,
        },
      });
      if (!current) throw feedbackNotFound();
      if (dto.version !== current.version)
        throw conflict(
          'FEEDBACK_CHANGED',
          'عُدّلت هذه الملاحظة للتو من طرف مسؤول آخر: أعد فتحها ثم احفظ تعديلك',
        );
      const status =
        dto.status !== undefined && dto.status !== current.status
          ? dto.status
          : null;
      const response =
        dto.response !== undefined &&
        (dto.response ?? null) !== current.adminResponse
          ? { text: dto.response ?? null }
          : null;
      if (!status && !response) return;
      const now = new Date();
      await tx.feedback.update({
        where: { id },
        data: {
          ...(status
            ? {
                status,
                resolvedAt: status === FeedbackStatus.RESOLVED ? now : null,
              }
            : {}),
          ...(response
            ? response.text
              ? {
                  adminResponse: response.text,
                  respondedByUserId: adminUserId,
                  respondedAt: now,
                }
              : {
                  adminResponse: null,
                  respondedByUserId: null,
                  respondedAt: null,
                }
            : {}),
          version: { increment: 1 },
        },
      });
      const answered = Boolean(response?.text);
      if ((status || answered) && current.createdByUserId !== adminUserId)
        await this.notifySender(tx, {
          feedbackId: id,
          userId: current.createdByUserId,
          adminUserId,
          message: updatedMessage(current.title, status, answered),
        });
    });
    return this.get(id);
  }

  // ───────────────────────── internals ─────────────────────────

  private async row(id: string): Promise<Row> {
    const row = await this.prisma.feedback.findUnique({
      where: { id },
      select,
    });
    if (!row) throw feedbackNotFound();
    return row;
  }

  /** One in-app notification to the sender (an inactive account is not told). */
  private async notifySender(
    tx: Tx,
    n: {
      feedbackId: string;
      userId: string;
      adminUserId: string;
      message: string;
    },
  ) {
    const sender = await tx.user.findUnique({
      where: { id: n.userId },
      select: { isActive: true },
    });
    if (!sender?.isActive) return;
    await tx.notification.create({
      data: {
        userId: n.userId,
        type: NotificationType.FEEDBACK_UPDATED,
        title: 'تحديث على ملاحظتك',
        message: n.message,
        entityType: NotificationEntity.FEEDBACK,
        entityId: n.feedbackId,
        actorUserId: n.adminUserId,
      },
    });
  }
}

/** «اقتراح تحسين من المعلم أحمد بن علي: «إضافة بحث في الحصص»» */
export function submittedMessage(r: {
  category: FeedbackCategory;
  title: string;
  senderRole: Role;
  createdBy: {
    id: string;
    username: string;
    person: { firstName: string; lastName: string; gender: Gender | null };
  };
}) {
  const role = r.senderRole as FeedbackSenderRole;
  const gender = r.createdBy.person.gender;
  const who = gender
    ? `${SENDER_TITLE[role][gender]} ${nameOf(r.createdBy)}`
    : nameOf(r.createdBy);
  return `${FEEDBACK_CATEGORY_LABEL[r.category]} من ${who}: «${r.title}»`;
}

/** What changed, in one sentence for the sender. */
export function updatedMessage(
  title: string,
  status: FeedbackStatus | null,
  answered: boolean,
) {
  const subject = `ملاحظتك «${title}»`;
  if (answered && status)
    return `ردّت الإدارة على ${subject}، وأصبحت حالتها: ${FEEDBACK_STATUS_LABEL[status]}`;
  if (answered) return `ردّت الإدارة على ${subject}`;
  return `أصبحت حالة ${subject}: ${FEEDBACK_STATUS_LABEL[status!]}`;
}
