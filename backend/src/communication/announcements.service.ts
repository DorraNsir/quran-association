import { ForbiddenException, Injectable } from '@nestjs/common';

import { fromDbDate, fromDbDateOrNull, toDbDate } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import {
  ActivationStatus,
  AnnouncementAudience,
  AnnouncementStatus,
  type Prisma,
  RecordStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StudentAccessService } from '../student-space/student-access.service.js';
import {
  TeacherAccessService,
  type TeacherScope,
} from '../teaching/teacher-access.service.js';
import type {
  AdminAnnouncementDto,
  AnnouncementDto,
  AnnouncementListDto,
  AnnouncementListQueryDto,
  AnnouncementState,
  PublishResultDto,
  TeacherAnnouncementDto,
  UpdateAdminAnnouncementDto,
  UpdateTeacherAnnouncementDto,
} from './announcement.dto.js';
import {
  studentAnnouncementWhere,
  teacherAnnouncementWhere,
} from './audience.js';
import { NotificationsService } from './notifications.service.js';

type Tx = Prisma.TransactionClient;

const nameOf = { select: { id: true, name: true } } as const;

const select = {
  id: true,
  title: true,
  content: true,
  audience: true,
  status: true,
  publishedAt: true,
  expiresAt: true,
  firstPublishedAt: true,
  archivedAt: true,
  publishedByUserId: true,
  publishedBy: {
    select: {
      id: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
  targets: {
    select: {
      groupClass: { select: { id: true, group: nameOf, branch: nameOf } },
    },
  },
  branchTargets: { select: { branch: nameOf } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AnnouncementSelect;

type Row = Prisma.AnnouncementGetPayload<{ select: typeof select }>;

export function stateOf(a: Row, today: string): AnnouncementState {
  if (a.status !== AnnouncementStatus.PUBLISHED) return a.status;
  if (fromDbDate(a.publishedAt) > today) return 'SCHEDULED';
  if (a.expiresAt && fromDbDate(a.expiresAt) < today) return 'EXPIRED';
  return 'ACTIVE';
}

function toDto(a: Row, today: string, canManage: boolean): AnnouncementDto {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    audience: a.audience,
    status: a.status,
    state: stateOf(a, today),
    publishedAt: fromDbDate(a.publishedAt),
    expiresAt: fromDbDateOrNull(a.expiresAt),
    firstPublishedAt: a.firstPublishedAt,
    archivedAt: a.archivedAt,
    groupClasses: a.targets.map((t) => t.groupClass),
    branches: a.branchTargets.map((t) => t.branch),
    publishedBy: { id: a.publishedBy.id, ...a.publishedBy.person },
    canManage,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export const announcementNotFound = () =>
  notFound('ANNOUNCEMENT_NOT_FOUND', 'الإعلان غير موجود');
const targetInvalid = (message: string) =>
  badRequest('ANNOUNCEMENT_TARGET_INVALID', message);
const classAccessDenied = () =>
  new ForbiddenException({
    code: 'ANNOUNCEMENT_CLASS_ACCESS_DENIED',
    message: 'لا يمكنك توجيه إعلان إلا لحلقاتك الحالية',
  });

type Targets = {
  audience: AnnouncementAudience;
  groupClassIds: string[];
  branchIds: string[];
};

type Actor =
  | { kind: 'admin'; userId: string }
  | { kind: 'teacher'; userId: string; scope: TeacherScope };

/**
 * Announcements (الإعلانات): private messages, separate from the public
 * website's news. Lifecycle: DRAFT (invisible, fully editable) → publish
 * (explicit; notifies the audience once, in the same transaction) →
 * PUBLISHED (only title, content and expiry stay editable — edits never
 * notify again) → ARCHIVED (hidden from readers, kept). Admins address the
 * whole association, roles, branches or classes; teachers only the classes
 * they are CURRENTLY assigned to.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
    private readonly notifications: NotificationsService,
    private readonly teacherAccess: TeacherAccessService,
    private readonly studentAccess: StudentAccessService,
  ) {}

  /* ------------------------------ actors ------------------------------ */

  admin(userId: string): Actor {
    return { kind: 'admin', userId };
  }

  async teacher(userId: string): Promise<Actor> {
    return {
      kind: 'teacher',
      userId,
      scope: await this.teacherAccess.currentScope(userId),
    };
  }

  /* ------------------------------ reads ------------------------------ */

  async list(
    actor: Actor,
    query: AnnouncementListQueryDto,
  ): Promise<AnnouncementListDto> {
    const today = await this.today();
    const base =
      actor.kind === 'admin'
        ? {}
        : teacherAnnouncementWhere(actor.scope, actor.userId, toDbDate(today));
    return this.page(query, base, actor.userId, today, (a) =>
      this.canManage(actor, a),
    );
  }

  async listForStudent(
    userId: string,
    query: AnnouncementListQueryDto,
  ): Promise<AnnouncementListDto> {
    const scope = await this.studentAccess.scopeOf(userId);
    const today = await this.today();
    return this.page(
      query,
      studentAnnouncementWhere(scope, toDbDate(today)),
      userId,
      today,
      () => false,
    );
  }

  async get(actor: Actor, id: string): Promise<AnnouncementDto> {
    const today = await this.today();
    const row = await this.findVisible(actor, id, today);
    return toDto(row, today, this.canManage(actor, row));
  }

  async getForStudent(userId: string, id: string): Promise<AnnouncementDto> {
    const scope = await this.studentAccess.scopeOf(userId);
    const today = await this.today();
    const row = await this.prisma.announcement.findFirst({
      where: { id, ...studentAnnouncementWhere(scope, toDbDate(today)) },
      select,
    });
    if (!row) throw announcementNotFound();
    return toDto(row, today, false);
  }

  /* ------------------------------ writes ------------------------------ */

  async createAsAdmin(
    userId: string,
    dto: AdminAnnouncementDto,
  ): Promise<AnnouncementDto> {
    return this.create(
      this.admin(userId),
      dto,
      this.targetsOf(dto.audience, dto.groupClassIds, dto.branchIds),
    );
  }

  async createAsTeacher(
    userId: string,
    dto: TeacherAnnouncementDto,
  ): Promise<AnnouncementDto> {
    return this.create(await this.teacher(userId), dto, {
      audience: AnnouncementAudience.SPECIFIC_GROUP_CLASSES,
      groupClassIds: dto.groupClassIds,
      branchIds: [],
    });
  }

  async update(
    actor: Actor,
    id: string,
    dto: UpdateAdminAnnouncementDto | UpdateTeacherAnnouncementDto,
  ): Promise<AnnouncementDto> {
    const today = await this.today();
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManaged(tx, actor, id, today);
      if (current.status === AnnouncementStatus.ARCHIVED)
        throw conflict(
          'ANNOUNCEMENT_ARCHIVED',
          'الإعلان مؤرشف ولا يمكن تعديله',
        );
      const audienceDto = 'audience' in dto ? dto.audience : undefined;
      const branchDto = 'branchIds' in dto ? dto.branchIds : undefined;
      const retarget =
        audienceDto !== undefined ||
        dto.groupClassIds !== undefined ||
        branchDto !== undefined;
      if (
        current.status === AnnouncementStatus.PUBLISHED &&
        (retarget || dto.publishedAt !== undefined)
      ) {
        throw conflict(
          'ANNOUNCEMENT_PUBLISHED_LOCKED',
          'بعد النشر يمكن تعديل العنوان والنص وتاريخ الانتهاء فقط',
        );
      }
      const publishedAt = dto.publishedAt ?? fromDbDate(current.publishedAt);
      const expiresAt =
        dto.expiresAt !== undefined
          ? dto.expiresAt
          : fromDbDateOrNull(current.expiresAt);
      this.assertDates(publishedAt, expiresAt);

      let targets: Targets | undefined;
      if (retarget) {
        const audience = audienceDto ?? current.audience;
        const keep = audience === current.audience;
        targets = this.targetsOf(
          audience,
          dto.groupClassIds ??
            (keep ? current.targets.map((t) => t.groupClass.id) : []),
          branchDto ??
            (keep ? current.branchTargets.map((t) => t.branch.id) : []),
        );
      }
      // Teachers keep editing only while assigned to every class it reaches
      this.assertTeacherTargets(
        actor,
        targets?.groupClassIds ?? current.targets.map((t) => t.groupClass.id),
      );
      if (targets) {
        await this.assertTargets(tx, targets);
        await tx.announcementTarget.deleteMany({
          where: { announcementId: id },
        });
        await tx.announcementBranchTarget.deleteMany({
          where: { announcementId: id },
        });
      }
      await tx.announcement.update({
        where: { id },
        data: {
          title: dto.title,
          content: dto.content,
          publishedAt: dto.publishedAt ? toDbDate(dto.publishedAt) : undefined,
          expiresAt:
            dto.expiresAt === undefined
              ? undefined
              : dto.expiresAt && toDbDate(dto.expiresAt),
          ...(targets ? this.targetData(targets) : {}),
        },
      });
    });
    return this.get(actor, id);
  }

  /**
   * DRAFT → PUBLISHED and the notifications, in one transaction under the
   * announcement row lock: a repeated or concurrent publish gets 409 and
   * notifies nobody twice; if notifying fails, nothing is published.
   */
  async publish(actor: Actor, id: string): Promise<PublishResultDto> {
    const today = await this.today();
    const notifiedCount = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManaged(tx, actor, id, today);
      if (current.status !== AnnouncementStatus.DRAFT) {
        throw conflict(
          'ANNOUNCEMENT_PUBLISH_CONFLICT',
          'هذا الإعلان منشور بالفعل (أو مؤرشف)',
        );
      }
      if (current.expiresAt && fromDbDate(current.expiresAt) < today) {
        throw conflict(
          'ANNOUNCEMENT_EXPIRED',
          'تاريخ انتهاء الإعلان قد مضى: عدّله قبل النشر',
        );
      }
      const targets = {
        audience: current.audience,
        groupClassIds: current.targets.map((t) => t.groupClass.id),
        branchIds: current.branchTargets.map((t) => t.branch.id),
      };
      this.assertTeacherTargets(actor, targets.groupClassIds);
      // The draft may be old: its targets must still be open
      await this.assertTargets(
        tx,
        this.targetsOf(
          targets.audience,
          targets.groupClassIds,
          targets.branchIds,
        ),
      );
      await tx.announcement.update({
        where: { id },
        data: {
          status: AnnouncementStatus.PUBLISHED,
          firstPublishedAt: new Date(),
        },
      });
      return this.notifications.notifyAnnouncement(tx, id, current.title);
    });
    return { announcement: await this.get(actor, id), notifiedCount };
  }

  /** PUBLISHED → ARCHIVED: hidden from readers; notifications stay but open nothing. */
  async archive(actor: Actor, id: string): Promise<AnnouncementDto> {
    const today = await this.today();
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManaged(tx, actor, id, today);
      if (current.status !== AnnouncementStatus.PUBLISHED) {
        throw conflict(
          'ANNOUNCEMENT_NOT_PUBLISHED',
          'لا يُؤرشف إلا إعلان منشور (احذف المسودة بدلًا من ذلك)',
        );
      }
      await tx.announcement.update({
        where: { id },
        data: { status: AnnouncementStatus.ARCHIVED, archivedAt: new Date() },
      });
    });
    return this.get(actor, id);
  }

  /** Hard delete: targets and its notifications go too (no dangling links). */
  async remove(actor: Actor, id: string): Promise<void> {
    const today = await this.today();
    await this.prisma.$transaction(async (tx) => {
      await this.lockManaged(tx, actor, id, today);
      await tx.announcement.delete({ where: { id } });
    });
  }

  /* ------------------------------ helpers ------------------------------ */

  private today() {
    return platformToday(this.prisma);
  }

  private canManage(actor: Actor, a: Pick<Row, 'publishedByUserId'>) {
    return actor.kind === 'admin' || a.publishedByUserId === actor.userId;
  }

  private visibleWhere(
    actor: Actor,
    today: string,
  ): Prisma.AnnouncementWhereInput {
    return actor.kind === 'admin'
      ? {}
      : teacherAnnouncementWhere(actor.scope, actor.userId, toDbDate(today));
  }

  /** Missing and not-visible look the same (404, no existence leak). */
  private async findVisible(
    actor: Actor,
    id: string,
    today: string,
    db: Tx | PrismaService = this.prisma,
  ): Promise<Row> {
    const row = await db.announcement.findFirst({
      where: { id, ...this.visibleWhere(actor, today) },
      select,
    });
    if (!row) throw announcementNotFound();
    return row;
  }

  /** Row lock + visibility + authorship (teachers manage only their own). */
  private async lockManaged(tx: Tx, actor: Actor, id: string, today: string) {
    await tx.$queryRaw`SELECT id FROM announcements WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await this.findVisible(actor, id, today, tx);
    if (!this.canManage(actor, row))
      throw new ForbiddenException({
        code: 'ANNOUNCEMENT_EDIT_FORBIDDEN',
        message: 'لا يمكنك تعديل إعلان نشره شخص آخر',
      });
    return row;
  }

  private assertTeacherTargets(actor: Actor, groupClassIds: string[]) {
    if (
      actor.kind === 'teacher' &&
      !groupClassIds.every((c) => actor.scope.classIds.includes(c))
    )
      throw classAccessDenied();
  }

  private assertDates(publishedAt: string, expiresAt: string | null) {
    if (expiresAt && expiresAt < publishedAt)
      throw badRequest(
        'INVALID_DATE_RANGE',
        'تاريخ الانتهاء يجب أن يكون بعد تاريخ النشر',
      );
  }

  private targetsOf(
    audience: AnnouncementAudience,
    groupClassIds: string[] = [],
    branchIds: string[] = [],
  ): Targets {
    if (audience === AnnouncementAudience.SPECIFIC_GROUP_CLASSES) {
      if (!groupClassIds.length || branchIds.length)
        throw targetInvalid('اختر حلقة واحدة على الأقل (groupClassIds فقط)');
    } else if (audience === AnnouncementAudience.SPECIFIC_BRANCHES) {
      if (!branchIds.length || groupClassIds.length)
        throw targetInvalid('اختر فرعًا واحدًا على الأقل (branchIds فقط)');
    } else if (groupClassIds.length || branchIds.length) {
      throw targetInvalid('هذا الجمهور لا يحدَّد له فرع أو حلقة');
    }
    return { audience, groupClassIds, branchIds };
  }

  private async assertTargets(tx: Tx, t: Targets) {
    if (t.groupClassIds.length) {
      const n = await tx.groupClass.count({
        where: {
          id: { in: t.groupClassIds },
          status: RecordStatus.ACTIVE,
          branch: { status: ActivationStatus.ACTIVE },
        },
      });
      if (n !== t.groupClassIds.length)
        throw targetInvalid('حلقة غير موجودة أو غير نشطة');
    }
    if (t.branchIds.length) {
      const n = await tx.branch.count({
        where: { id: { in: t.branchIds }, status: ActivationStatus.ACTIVE },
      });
      if (n !== t.branchIds.length)
        throw targetInvalid('فرع غير موجود أو غير نشط');
    }
  }

  private targetData(t: Targets) {
    return {
      audience: t.audience,
      targets: {
        create: t.groupClassIds.map((groupClassId) => ({ groupClassId })),
      },
      branchTargets: { create: t.branchIds.map((branchId) => ({ branchId })) },
    };
  }

  private async create(
    actor: Actor,
    dto: AdminAnnouncementDto | TeacherAnnouncementDto,
    targets: Targets,
  ): Promise<AnnouncementDto> {
    const today = await this.today();
    const publishedAt = dto.publishedAt ?? today;
    this.assertDates(publishedAt, dto.expiresAt ?? null);
    this.assertTeacherTargets(actor, targets.groupClassIds);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertTargets(tx, targets);
      const created = await tx.announcement.create({
        data: {
          title: dto.title,
          content: dto.content,
          publishedAt: toDbDate(publishedAt),
          expiresAt: dto.expiresAt ? toDbDate(dto.expiresAt) : null,
          publishedByUserId: actor.userId,
          ...this.targetData(targets),
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.get(actor, id);
  }

  private async page(
    query: AnnouncementListQueryDto,
    base: Prisma.AnnouncementWhereInput,
    userId: string,
    today: string,
    canManage: (a: Row) => boolean,
  ): Promise<AnnouncementListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.AnnouncementWhereInput = {
      AND: [
        base,
        {
          ...(query.status ? { status: query.status } : {}),
          ...(query.audience ? { audience: query.audience } : {}),
          ...(query.mine ? { publishedByUserId: userId } : {}),
          ...(query.groupClassId
            ? { targets: { some: { groupClassId: query.groupClassId } } }
            : {}),
          ...(query.branchId
            ? { branchTargets: { some: { branchId: query.branchId } } }
            : {}),
          ...(query.from || query.to
            ? {
                publishedAt: {
                  ...(query.from ? { gte: toDbDate(query.from) } : {}),
                  ...(query.to ? { lte: toDbDate(query.to) } : {}),
                },
              }
            : {}),
        },
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { content: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        select,
        orderBy: [
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((a) => toDto(a, today, canManage(a))),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }
}
