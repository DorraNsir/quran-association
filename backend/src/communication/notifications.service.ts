import { Injectable } from '@nestjs/common';

import { notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import {
  NotificationEntity,
  NotificationType,
  type Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  NotificationDto,
  NotificationListDto,
  NotificationListQueryDto,
  ReadAllResultDto,
  UnreadCountDto,
} from './notification.dto.js';
import {
  type ActorCapacity,
  actorSentence,
  type NotificationActor,
} from './notification-text.js';

type Tx = Prisma.TransactionClient;

const select = {
  id: true,
  type: true,
  title: true,
  message: true,
  resourceId: true,
  announcementId: true,
  sessionId: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type Row = Prisma.NotificationGetPayload<{ select: typeof select }>;

/** Subjects only named by id (no link column): whether they still exist is looked up. */
const UNLINKED = [
  NotificationEntity.REGISTRATION_REQUEST,
  NotificationEntity.ONBOARDING_SUBMISSION,
  NotificationEntity.STUDENT,
  NotificationEntity.GROUP_CLASS,
  NotificationEntity.FEEDBACK,
] as NotificationEntity[];

/**
 * Whether it still opens something. A linked subject's link column is cleared
 * when its content is deleted; an unlinked one is gone when its row is
 * (`gone`). Nothing to open is never available. Opening checks access again.
 */
function isAvailable(n: Row, gone: Set<string>) {
  switch (n.entityType) {
    case NotificationEntity.RESOURCE:
      return n.resourceId !== null;
    case NotificationEntity.ANNOUNCEMENT:
      return n.announcementId !== null;
    case NotificationEntity.SESSION:
      return n.sessionId !== null;
    case null:
      return false;
    default:
      return !gone.has(n.entityId!);
  }
}

function toDto(n: Row, gone: Set<string>): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    entityType: n.entityType,
    entityId: n.entityId,
    available: isAvailable(n, gone),
    createdAt: n.createdAt,
    readAt: n.readAt,
    isRead: n.readAt !== null,
  };
}

const notificationNotFound = () =>
  notFound('NOTIFICATION_NOT_FOUND', 'الإشعار غير موجود');

/**
 * In-app notifications: ONE row per recipient account (its own readAt).
 * Recipients are resolved server-side, in one INSERT … SELECT inside the
 * publishing transaction (no N+1, no partial state): active accounts only,
 * deduplicated per account (a multi-role account matching several rules is
 * notified once), never the author, and the (user, item) unique keys make a
 * repeated publication a no-op. Notifications exist only for content that is
 * actually published (a scheduled announcement notifies when it publishes). A notification grants no access: the linked
 * content is authorized again on every read.
 *
 * Every message names who did it (see notification-text.ts), and that
 * person is never notified of their own action.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  /**
   * A new resource reaches, once each (a multi-role account once):
   *  - the active students who can see it (same rule as studentResourceWhere);
   *  - the teachers EXPLICITLY in its audience: assigned (supervisor or
   *    assistant) to a targeted class, or to a class of a targeted group —
   *    never every teacher for an all-students resource;
   *  - the active admins, when a teacher publishes it (an admin's own
   *    publication tells no other admin).
   * Never its author. Inactive accounts and teachers are skipped. In the
   * publishing transaction: a refused publication notifies nobody.
   */
  async notifyResource(
    tx: Tx,
    resourceId: string,
    title: string,
    by: { actor: NotificationActor; capacity: ActorCapacity },
  ) {
    const message = actorSentence(by.actor, by.capacity, {
      male: (who) => `نشر ${who} موردًا جديدًا: «${title}»`,
      female: (who) => `نشرت ${who} موردًا جديدًا: «${title}»`,
      passive: (byName) => `نُشر مورد جديد: «${title}» ${byName}`,
    });
    const toAdmins = by.capacity === 'TEACHER';
    return tx.$executeRaw`
      INSERT INTO notifications (id, "userId", type, title, message, "resourceId", "entityType", "entityId", "actorUserId")
      SELECT uuidv7(), x.id, ${NotificationType.RESOURCE_PUBLISHED}::"NotificationType",
             'مورد جديد', ${message}, ${resourceId}::uuid,
             ${NotificationEntity.RESOURCE}::"NotificationEntity", ${resourceId}::uuid, ${by.actor.userId}::uuid
      FROM (
        SELECT u.id FROM resources r
        JOIN users u ON u."isActive"
        JOIN user_roles ur ON ur."userId" = u.id AND ur.role = 'STUDENT'
        JOIN students s ON s."personId" = u."personId" AND s.status = 'ACTIVE'
        LEFT JOIN group_classes gc ON gc.id = s."groupClassId"
        WHERE r.id = ${resourceId}::uuid
          AND (r.visibility = 'ALL_STUDENTS' OR EXISTS (
            SELECT 1 FROM resource_targets t
            WHERE t."resourceId" = r.id
              AND ((r.visibility = 'GROUP_CLASS' AND t."groupClassId" = s."groupClassId")
                OR (r.visibility = 'GROUP' AND t."groupId" = gc."groupId"))))
        UNION
        SELECT u.id FROM resources r
        JOIN resource_targets t ON t."resourceId" = r.id
        JOIN group_classes gc ON (r.visibility = 'GROUP_CLASS' AND gc.id = t."groupClassId")
                              OR (r.visibility = 'GROUP' AND gc."groupId" = t."groupId")
        JOIN teachers te ON te.status = 'ACTIVE' AND (te.id = gc."supervisorId" OR EXISTS (
          SELECT 1 FROM group_class_assistants ga WHERE ga."groupClassId" = gc.id AND ga."teacherId" = te.id))
        JOIN users u ON u."personId" = te."personId" AND u."isActive"
        JOIN user_roles ur ON ur."userId" = u.id AND ur.role = 'TEACHER'
        WHERE r.id = ${resourceId}::uuid
        UNION
        SELECT u.id FROM users u
        JOIN user_roles ur ON ur."userId" = u.id AND ur.role = 'ADMIN'
        WHERE ${toAdmins} AND u."isActive"
      ) x
      WHERE x.id <> (SELECT "publishedByUserId" FROM resources WHERE id = ${resourceId}::uuid)
        AND x.id <> ${by.actor.userId}::uuid
      ON CONFLICT DO NOTHING`;
  }

  /**
   * Accounts reached by the announcement (same rules as the announcement read
   * filters). Published by someone now (its author, or an admin publishing
   * it), or by the scheduler at its time — then its author is named, as the
   * person responsible for it, and nobody is invented as having published it.
   */
  async notifyAnnouncement(
    tx: Tx,
    announcementId: string,
    title: string,
    by:
      | { actor: NotificationActor; capacity: ActorCapacity }
      | { scheduledBy: NotificationActor | null },
  ) {
    const actor = 'actor' in by ? by.actor : by.scheduledBy;
    const message =
      'actor' in by
        ? actorSentence(by.actor, by.capacity, {
            male: (who) => `نشر ${who} إعلانًا: «${title}»`,
            female: (who) => `نشرت ${who} إعلانًا: «${title}»`,
            passive: (byName) => `نُشر إعلان: «${title}» ${byName}`,
          })
        : by.scheduledBy
          ? `نُشر في موعده المجدول إعلان: «${title}» من طرف ${by.scheduledBy.name}`
          : `نُشر في موعده المجدول إعلان: «${title}»`;
    return tx.$executeRaw`
      INSERT INTO notifications (id, "userId", type, title, message, "announcementId", "entityType", "entityId", "actorUserId")
      SELECT uuidv7(), r.id, ${NotificationType.ANNOUNCEMENT_PUBLISHED}::"NotificationType",
             'إعلان جديد', ${message}, ${announcementId}::uuid,
             ${NotificationEntity.ANNOUNCEMENT}::"NotificationEntity", ${announcementId}::uuid,
             ${actor?.userId ?? null}::uuid
      FROM (
        SELECT u.id FROM announcements a
        JOIN users u ON u."isActive"
        JOIN user_roles ur ON ur."userId" = u.id AND ur.role = 'STUDENT'
        JOIN students s ON s."personId" = u."personId" AND s.status = 'ACTIVE'
        LEFT JOIN group_classes gc ON gc.id = s."groupClassId"
        WHERE a.id = ${announcementId}::uuid
          AND (a.audience IN ('EVERYONE', 'STUDENTS')
            OR (a.audience = 'SPECIFIC_GROUP_CLASSES' AND EXISTS (
              SELECT 1 FROM announcement_targets x
              WHERE x."announcementId" = a.id AND x."groupClassId" = s."groupClassId"))
            OR (a.audience = 'SPECIFIC_BRANCHES' AND EXISTS (
              SELECT 1 FROM announcement_branch_targets b
              WHERE b."announcementId" = a.id AND b."branchId" = gc."branchId")))
        UNION
        SELECT u.id FROM announcements a
        JOIN users u ON u."isActive"
        JOIN user_roles ur ON ur."userId" = u.id AND ur.role = 'TEACHER'
        JOIN teachers t ON t."personId" = u."personId" AND t.status = 'ACTIVE'
        WHERE a.id = ${announcementId}::uuid
          AND (a.audience IN ('EVERYONE', 'TEACHERS')
            OR (a.audience IN ('SPECIFIC_GROUP_CLASSES', 'SPECIFIC_BRANCHES') AND EXISTS (
              SELECT 1 FROM group_classes gc
              WHERE (gc."supervisorId" = t.id OR EXISTS (
                      SELECT 1 FROM group_class_assistants ga
                      WHERE ga."groupClassId" = gc.id AND ga."teacherId" = t.id))
                AND ((a.audience = 'SPECIFIC_GROUP_CLASSES' AND EXISTS (
                        SELECT 1 FROM announcement_targets x
                        WHERE x."announcementId" = a.id AND x."groupClassId" = gc.id))
                  OR (a.audience = 'SPECIFIC_BRANCHES' AND EXISTS (
                        SELECT 1 FROM announcement_branch_targets b
                        WHERE b."announcementId" = a.id AND b."branchId" = gc."branchId"))))))
        UNION
        SELECT u.id FROM announcements a
        JOIN users u ON u."isActive"
        JOIN user_roles ur ON ur."userId" = u.id AND ur.role = 'ADMIN'
        WHERE a.id = ${announcementId}::uuid AND a.audience = 'EVERYONE'
      ) r
      WHERE r.id <> (SELECT "publishedByUserId" FROM announcements WHERE id = ${announcementId}::uuid)
        AND r.id IS DISTINCT FROM ${actor?.userId ?? null}::uuid
      ON CONFLICT DO NOTHING`;
  }

  /**
   * Every active admin account, once each (an admin who is also a teacher is
   * one account), never the actor. A request reaches each admin once (unique
   * key): a repeated call for the same request is a no-op. Returns how many
   * were notified.
   */
  async notifyAdmins(
    tx: Tx,
    n: {
      type: NotificationType;
      entityType: NotificationEntity;
      entityId: string;
      title: string;
      message: string;
      /** null: nobody with an account did it (a public submission) */
      actorUserId: string | null;
    },
  ) {
    return tx.$executeRaw`
      INSERT INTO notifications (id, "userId", type, title, message, "entityType", "entityId", "actorUserId")
      SELECT uuidv7(), u.id, ${n.type}::"NotificationType", ${n.title}, ${n.message},
             ${n.entityType}::"NotificationEntity", ${n.entityId}::uuid, ${n.actorUserId}::uuid
      FROM users u
      WHERE u."isActive"
        AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur."userId" = u.id AND ur.role = 'ADMIN')
        AND u.id IS DISTINCT FROM ${n.actorUserId}::uuid
      ON CONFLICT DO NOTHING`;
  }

  /** The user's notifications, newest first. */
  async list(
    userId: string,
    query: NotificationListQueryDto,
  ): Promise<NotificationListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const gone = await this.goneSubjects(rows);
    return {
      data: rows.map((n) => toDto(n, gone)),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async unreadCount(userId: string): Promise<UnreadCountDto> {
    return {
      count: await this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    };
  }

  /** Idempotent: an already-read notification keeps its first readAt. */
  async markRead(userId: string, id: string): Promise<NotificationDto> {
    // Another user's notification is indistinguishable from a missing one
    const where = { id, userId };
    await this.prisma.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.prisma.notification.findFirst({ where, select });
    if (!row) throw notificationNotFound();
    return toDto(row, await this.goneSubjects([row]));
  }

  /**
   * The unlinked subjects of these notifications whose row no longer exists
   * (a deleted request, submission, student or class): one query per kind.
   */
  private async goneSubjects(rows: Row[]): Promise<Set<string>> {
    /** The rows of that kind that still exist (no query when the page has none). */
    const existing = async (
      type: NotificationEntity,
      find: (args: {
        where: { id: { in: string[] } };
        select: { id: true };
      }) => Promise<{ id: string }[]>,
    ) => {
      const ids = [
        ...new Set(
          rows.filter((r) => r.entityType === type).map((r) => r.entityId!),
        ),
      ];
      return ids.length
        ? find({ where: { id: { in: ids } }, select: { id: true } })
        : [];
    };
    const found = await Promise.all([
      existing(NotificationEntity.REGISTRATION_REQUEST, (a) =>
        this.prisma.registrationRequest.findMany(a),
      ),
      existing(NotificationEntity.ONBOARDING_SUBMISSION, (a) =>
        this.prisma.onboardingSubmission.findMany(a),
      ),
      existing(NotificationEntity.STUDENT, (a) =>
        this.prisma.student.findMany(a),
      ),
      existing(NotificationEntity.GROUP_CLASS, (a) =>
        this.prisma.groupClass.findMany(a),
      ),
      existing(NotificationEntity.FEEDBACK, (a) =>
        this.prisma.feedback.findMany(a),
      ),
    ]);
    const present = new Set(found.flat().map((r) => r.id));
    return new Set(
      rows
        .filter(
          (r) =>
            r.entityType &&
            UNLINKED.includes(r.entityType) &&
            !present.has(r.entityId!),
        )
        .map((r) => r.entityId!),
    );
  }

  async markAllRead(userId: string): Promise<ReadAllResultDto> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
