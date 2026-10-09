import { ForbiddenException, Injectable, Logger } from '@nestjs/common';

import {
  fromDbDate,
  fromDbDateOrNull,
  toDbDate,
  toLocalDateTime,
} from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import {
  localDateTimeToInstant,
  platformDayBounds,
  platformTimezone,
  platformToday,
} from '../common/platform-clock.js';
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
  PublicationMode,
  PublishResultDto,
  ScheduleAnnouncementDto,
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
  scheduledFor: true,
  publishedAt: true,
  expiresAt: true,
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

/** Derived for `today` (YYYY-MM-DD, platform calendar). */
export function stateOf(
  a: Pick<Row, 'status' | 'expiresAt'>,
  today: string,
): AnnouncementState {
  if (a.status !== AnnouncementStatus.PUBLISHED) return a.status;
  if (a.expiresAt && fromDbDate(a.expiresAt) < today) return 'EXPIRED';
  return 'ACTIVE';
}

/** Longest scheduling horizon. */
const MAX_SCHEDULE_DAYS = 366;

export const announcementNotFound = () =>
  notFound('ANNOUNCEMENT_NOT_FOUND', 'الإعلان غير موجود');
const targetInvalid = (message: string) =>
  badRequest('ANNOUNCEMENT_TARGET_INVALID', message);
const classAccessDenied = () =>
  new ForbiddenException({
    code: 'ANNOUNCEMENT_CLASS_ACCESS_DENIED',
    message: 'لا يمكنك توجيه إعلان إلا لأقسامك الحالية',
  });
const dateRangeInvalid = () =>
  badRequest('INVALID_DATE_RANGE', 'تاريخ الانتهاء يجب ألا يسبق تاريخ النشر');

type Targets = {
  audience: AnnouncementAudience;
  groupClassIds: string[];
  branchIds: string[];
};

type Actor =
  | { kind: 'admin'; userId: string }
  | { kind: 'teacher'; userId: string; scope: TeacherScope };

/** Platform calendar context of one request. */
type Clock = { today: string; timezone: string };

/**
 * Announcements (الإعلانات): private messages, separate from the public
 * website's news. Lifecycle:
 *
 *   DRAFT ──publish──────────────────────────────▶ PUBLISHED ──archive──▶ ARCHIVED
 *     │  ▲                                            ▲
 *     │  └─cancel─┐                                   │ (scheduler, at scheduledFor)
 *     └─schedule─▶ SCHEDULED ──publish now / due──────┘
 *
 * Publication (now, or by the scheduler when due) sets the actual instant
 * and notifies the audience resolved AT THAT MOMENT, in one transaction.
 * Admins address the association, roles, branches or classes and may
 * schedule; teachers only their CURRENT classes, publishing now or drafting.
 */
@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

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
    const clock = await this.clock();
    return this.page(
      query,
      this.visibleWhere(actor, clock.today),
      actor.userId,
      clock,
      (a) => this.canManage(actor, a),
    );
  }

  async listForStudent(
    userId: string,
    query: AnnouncementListQueryDto,
  ): Promise<AnnouncementListDto> {
    const scope = await this.studentAccess.scopeOf(userId);
    const clock = await this.clock();
    return this.page(
      query,
      studentAnnouncementWhere(scope, toDbDate(clock.today)),
      userId,
      clock,
      () => false,
    );
  }

  async get(actor: Actor, id: string): Promise<AnnouncementDto> {
    const clock = await this.clock();
    const row = await this.findVisible(actor, id, clock.today);
    return this.toDto(row, clock, this.canManage(actor, row));
  }

  async getForStudent(userId: string, id: string): Promise<AnnouncementDto> {
    const scope = await this.studentAccess.scopeOf(userId);
    const clock = await this.clock();
    const row = await this.prisma.announcement.findFirst({
      where: { id, ...studentAnnouncementWhere(scope, toDbDate(clock.today)) },
      select,
    });
    if (!row) throw announcementNotFound();
    return this.toDto(row, clock, false);
  }

  /* ------------------------------ writes ------------------------------ */

  async createAsAdmin(
    userId: string,
    dto: AdminAnnouncementDto,
  ): Promise<PublishResultDto> {
    return this.create(
      this.admin(userId),
      dto,
      this.targetsOf(dto.audience, dto.groupClassIds, dto.branchIds),
      dto.mode ?? 'PUBLISH_NOW',
      dto.scheduledAt,
    );
  }

  async createAsTeacher(
    userId: string,
    dto: TeacherAnnouncementDto,
  ): Promise<PublishResultDto> {
    return this.create(
      await this.teacher(userId),
      dto,
      {
        audience: AnnouncementAudience.SPECIFIC_GROUP_CLASSES,
        groupClassIds: dto.groupClassIds,
        branchIds: [],
      },
      dto.mode ?? 'PUBLISH_NOW',
      undefined,
    );
  }

  /**
   * DRAFT / SCHEDULED: content, audience and expiry are editable (a schedule
   * keeps its time — change it with /schedule). PUBLISHED: title, content and
   * expiry only; edits never notify again. ARCHIVED: frozen.
   */
  async update(
    actor: Actor,
    id: string,
    dto: UpdateAdminAnnouncementDto | UpdateTeacherAnnouncementDto,
  ): Promise<AnnouncementDto> {
    const clock = await this.clock();
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManaged(tx, actor, id, clock.today);
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
      if (current.status === AnnouncementStatus.PUBLISHED && retarget) {
        throw conflict(
          'ANNOUNCEMENT_PUBLISHED_LOCKED',
          'بعد النشر يمكن تعديل العنوان والنص وتاريخ الانتهاء فقط',
        );
      }
      if (dto.expiresAt !== undefined)
        this.assertExpiry(dto.expiresAt, this.publicationDay(current, clock));

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
   * Publish NOW a DRAFT (or, for admins, a SCHEDULED one ahead of time):
   * status, actual instant and notifications in one transaction under the
   * row lock — a repeated/concurrent publish (or a scheduler run) gets 409
   * and nobody is notified twice.
   */
  async publish(actor: Actor, id: string): Promise<PublishResultDto> {
    const clock = await this.clock();
    const notifiedCount = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManaged(tx, actor, id, clock.today);
      const publishable: AnnouncementStatus[] =
        actor.kind === 'admin'
          ? [AnnouncementStatus.DRAFT, AnnouncementStatus.SCHEDULED]
          : [AnnouncementStatus.DRAFT];
      if (!publishable.includes(current.status)) {
        throw conflict(
          'ANNOUNCEMENT_PUBLISH_CONFLICT',
          'هذا الإعلان منشور بالفعل (أو مؤرشف)',
        );
      }
      return this.publishNow(tx, actor, current, clock);
    });
    return { announcement: await this.get(actor, id), notifiedCount };
  }

  /** Admin: DRAFT → SCHEDULED, or move a pending SCHEDULED one (reschedule). */
  async schedule(
    actor: Actor,
    id: string,
    dto: ScheduleAnnouncementDto,
  ): Promise<AnnouncementDto> {
    const clock = await this.clock();
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManaged(tx, actor, id, clock.today);
      if (
        current.status !== AnnouncementStatus.DRAFT &&
        current.status !== AnnouncementStatus.SCHEDULED
      ) {
        throw conflict(
          'ANNOUNCEMENT_NOT_SCHEDULABLE',
          'لا تُجدول إلا مسودة أو إعلان مجدول لم يُنشر بعد',
        );
      }
      await this.assertTargets(tx, this.targetsOfRow(current));
      const scheduledFor = await this.scheduleInstant(
        tx,
        dto.scheduledAt,
        fromDbDateOrNull(current.expiresAt),
      );
      await tx.announcement.update({
        where: { id },
        data: { status: AnnouncementStatus.SCHEDULED, scheduledFor },
      });
    });
    return this.get(actor, id);
  }

  /** Admin: SCHEDULED → DRAFT (nothing was visible, nobody was notified). */
  async cancelSchedule(actor: Actor, id: string): Promise<AnnouncementDto> {
    const clock = await this.clock();
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManaged(tx, actor, id, clock.today);
      if (current.status !== AnnouncementStatus.SCHEDULED) {
        throw conflict(
          'ANNOUNCEMENT_NOT_SCHEDULED',
          'هذا الإعلان غير مجدول (ربما نُشر بالفعل)',
        );
      }
      await tx.announcement.update({
        where: { id },
        data: { status: AnnouncementStatus.DRAFT, scheduledFor: null },
      });
    });
    return this.get(actor, id);
  }

  /** PUBLISHED → ARCHIVED: hidden from readers; notifications stay but open nothing. */
  async archive(actor: Actor, id: string): Promise<AnnouncementDto> {
    const clock = await this.clock();
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockManaged(tx, actor, id, clock.today);
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
    const clock = await this.clock();
    await this.prisma.$transaction(async (tx) => {
      await this.lockManaged(tx, actor, id, clock.today);
      await tx.announcement.delete({ where: { id } });
    });
  }

  /* ------------------------- scheduled publication ------------------------- */

  /**
   * Publishes every SCHEDULED announcement whose time has come, one per
   * transaction: the row is claimed with FOR UPDATE SKIP LOCKED and its
   * status re-read under that lock, so concurrent runs (several timers,
   * several API instances, a manual "publish now" or a cancel) never publish
   * twice — each due announcement is taken by exactly one of them. Recipients
   * are resolved now, at the actual publication. Returns the ids published.
   */
  async publishDue(limit = 100): Promise<string[]> {
    const published: string[] = [];
    while (published.length < limit) {
      const id = await this.prisma.$transaction(async (tx) => {
        const [due] = await tx.$queryRaw<{ id: string; title: string }[]>`
          SELECT id, title FROM announcements
          WHERE status = 'SCHEDULED' AND "scheduledFor" <= now()
          ORDER BY "scheduledFor", id
          LIMIT 1
          FOR UPDATE SKIP LOCKED`;
        if (!due) return null;
        await this.markPublished(tx, due.id, false);
        const notified = await this.notifications.notifyAnnouncement(
          tx,
          due.id,
          due.title,
        );
        this.logger.log(
          `Scheduled announcement ${due.id} published (${notified} notified)`,
        );
        return due.id;
      });
      if (!id) break;
      published.push(id);
    }
    return published;
  }

  /* ------------------------------ helpers ------------------------------ */

  private async clock(): Promise<Clock> {
    return {
      today: await platformToday(this.prisma),
      timezone: await platformTimezone(this.prisma),
    };
  }

  private toDto(a: Row, clock: Clock, canManage: boolean): AnnouncementDto {
    return {
      id: a.id,
      title: a.title,
      content: a.content,
      audience: a.audience,
      status: a.status,
      state: stateOf(a, clock.today),
      scheduledFor: a.scheduledFor,
      scheduledForLocal: a.scheduledFor
        ? toLocalDateTime(a.scheduledFor, clock.timezone)
        : null,
      publishedAt: a.publishedAt,
      expiresAt: fromDbDateOrNull(a.expiresAt),
      archivedAt: a.archivedAt,
      groupClasses: a.targets.map((t) => t.groupClass),
      branches: a.branchTargets.map((t) => t.branch),
      publishedBy: { id: a.publishedBy.id, ...a.publishedBy.person },
      canManage,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  /** The (local) day it is / will be published: for expiry checks. */
  private publicationDay(a: Row, clock: Clock) {
    const instant = a.publishedAt ?? a.scheduledFor;
    return instant
      ? toLocalDateTime(instant, clock.timezone).slice(0, 10)
      : clock.today;
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

  /** Status + actual instant (database clock), in the caller's transaction. */
  private async markPublished(tx: Tx, id: string, clearSchedule: boolean) {
    await tx.$executeRaw`
      UPDATE announcements
      SET status = 'PUBLISHED', "publishedAt" = now(), "updatedAt" = now(),
          "scheduledFor" = CASE WHEN ${clearSchedule} THEN NULL ELSE "scheduledFor" END
      WHERE id = ${id}::uuid`;
  }

  /** Checks, then publish + notify (caller holds the row lock). */
  private async publishNow(tx: Tx, actor: Actor, current: Row, clock: Clock) {
    if (current.expiresAt && fromDbDate(current.expiresAt) < clock.today) {
      throw conflict(
        'ANNOUNCEMENT_EXPIRED',
        'تاريخ انتهاء الإعلان قد مضى: عدّله قبل النشر',
      );
    }
    const targets = this.targetsOfRow(current);
    this.assertTeacherTargets(actor, targets.groupClassIds);
    // The draft may be old: its targets must still be open
    await this.assertTargets(tx, targets);
    // Published early: the pending schedule no longer applies
    await this.markPublished(tx, current.id, true);
    return this.notifications.notifyAnnouncement(tx, current.id, current.title);
  }

  /**
   * Africa/Tunis wall-clock → instant (PostgreSQL AT TIME ZONE); must be in
   * the future, within MAX_SCHEDULE_DAYS, and not after the expiry day.
   */
  private async scheduleInstant(
    tx: Tx,
    local: string,
    expiresAt: string | null,
  ): Promise<Date> {
    const instant = await localDateTimeToInstant(tx, local);
    const now = Date.now();
    if (instant.getTime() <= now) {
      throw badRequest(
        'SCHEDULE_IN_PAST',
        'وقت النشر المجدول يجب أن يكون في المستقبل (بتوقيت تونس)',
      );
    }
    if (instant.getTime() > now + MAX_SCHEDULE_DAYS * 86_400_000) {
      throw badRequest(
        'SCHEDULE_TOO_FAR',
        `لا تتجاوز الجدولة ${MAX_SCHEDULE_DAYS} يومًا`,
      );
    }
    this.assertExpiry(expiresAt, local.slice(0, 10));
    return instant;
  }

  private assertExpiry(expiresAt: string | null, publicationDay: string) {
    if (expiresAt && expiresAt < publicationDay) throw dateRangeInvalid();
  }

  private assertTeacherTargets(actor: Actor, groupClassIds: string[]) {
    if (
      actor.kind === 'teacher' &&
      !groupClassIds.every((c) => actor.scope.classIds.includes(c))
    )
      throw classAccessDenied();
  }

  private targetsOfRow(a: Row): Targets {
    return this.targetsOf(
      a.audience,
      a.targets.map((t) => t.groupClass.id),
      a.branchTargets.map((t) => t.branch.id),
    );
  }

  private targetsOf(
    audience: AnnouncementAudience,
    groupClassIds: string[] = [],
    branchIds: string[] = [],
  ): Targets {
    if (audience === AnnouncementAudience.SPECIFIC_GROUP_CLASSES) {
      if (!groupClassIds.length || branchIds.length)
        throw targetInvalid('اختر قسمًا واحدًا على الأقل (groupClassIds فقط)');
    } else if (audience === AnnouncementAudience.SPECIFIC_BRANCHES) {
      if (!branchIds.length || groupClassIds.length)
        throw targetInvalid('اختر فرعًا واحدًا على الأقل (branchIds فقط)');
    } else if (groupClassIds.length || branchIds.length) {
      throw targetInvalid('هذا الجمهور لا يحدَّد له فرع أو قسم');
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
        throw targetInvalid('قسم غير موجود أو غير نشط');
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

  /** Create as DRAFT, then publish now / schedule in the same transaction. */
  private async create(
    actor: Actor,
    dto: AdminAnnouncementDto | TeacherAnnouncementDto,
    targets: Targets,
    mode: PublicationMode,
    scheduledAt: string | undefined,
  ): Promise<PublishResultDto> {
    if ((mode === 'SCHEDULE') !== Boolean(scheduledAt)) {
      throw badRequest(
        'SCHEDULED_AT_INVALID',
        mode === 'SCHEDULE'
          ? 'حدّد وقت النشر المجدول (scheduledAt)'
          : 'scheduledAt يُستعمل مع mode = SCHEDULE فقط',
      );
    }
    const clock = await this.clock();
    if (mode !== 'SCHEDULE')
      this.assertExpiry(dto.expiresAt ?? null, clock.today);
    this.assertTeacherTargets(actor, targets.groupClassIds);
    const { id, notifiedCount } = await this.prisma.$transaction(async (tx) => {
      await this.assertTargets(tx, targets);
      const scheduledFor =
        mode === 'SCHEDULE'
          ? await this.scheduleInstant(tx, scheduledAt!, dto.expiresAt ?? null)
          : null;
      const created = await tx.announcement.create({
        data: {
          title: dto.title,
          content: dto.content,
          expiresAt: dto.expiresAt ? toDbDate(dto.expiresAt) : null,
          publishedByUserId: actor.userId,
          ...(scheduledFor
            ? { status: AnnouncementStatus.SCHEDULED, scheduledFor }
            : {}),
          ...this.targetData(targets),
        },
        select: { id: true },
      });
      if (mode !== 'PUBLISH_NOW') return { id: created.id, notifiedCount: 0 };
      await this.markPublished(tx, created.id, true);
      return {
        id: created.id,
        notifiedCount: await this.notifications.notifyAnnouncement(
          tx,
          created.id,
          dto.title,
        ),
      };
    });
    return { announcement: await this.get(actor, id), notifiedCount };
  }

  private async page(
    query: AnnouncementListQueryDto,
    base: Prisma.AnnouncementWhereInput,
    userId: string,
    clock: Clock,
    canManage: (a: Row) => boolean,
  ): Promise<AnnouncementListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const publishedAt = await platformDayBounds(
      this.prisma,
      query.from,
      query.to,
    );
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
          ...(Object.keys(publishedAt).length ? { publishedAt } : {}),
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
        // Not yet published (drafts, scheduled) first, then newest publications
        orderBy: [
          { publishedAt: { sort: 'desc', nulls: 'first' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((a) => this.toDto(a, clock, canManage(a))),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }
}
