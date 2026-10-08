import { Injectable } from '@nestjs/common';

import { toDbDate } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import { NotificationType, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  NotificationDto,
  NotificationListDto,
  NotificationListQueryDto,
  ReadAllResultDto,
  UnreadCountDto,
} from './notification.dto.js';

type Tx = Prisma.TransactionClient;

const select = {
  id: true,
  type: true,
  title: true,
  message: true,
  resourceId: true,
  announcementId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type Row = Prisma.NotificationGetPayload<{ select: typeof select }>;

function toDto(n: Row): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    entityType: n.resourceId ? 'RESOURCE' : 'ANNOUNCEMENT',
    entityId: (n.resourceId ?? n.announcementId)!,
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
 * repeated publication a no-op. A notification grants no access: the linked
 * content is authorized again on every read.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  /** Student accounts that can see the resource (same rule as studentResourceWhere). */
  async notifyResource(tx: Tx, resourceId: string, title: string) {
    return tx.$executeRaw`
      INSERT INTO notifications (id, "userId", type, title, message, "resourceId")
      SELECT uuidv7(), u.id, ${NotificationType.RESOURCE_PUBLISHED}::"NotificationType",
             'مورد جديد', ${`تم نشر مورد جديد: ${title}`}, r.id
      FROM resources r
      JOIN users u ON u."isActive" AND u.id <> r."publishedByUserId"
      JOIN user_roles ur ON ur."userId" = u.id AND ur.role = 'STUDENT'
      JOIN students s ON s."personId" = u."personId" AND s.status = 'ACTIVE'
      LEFT JOIN group_classes gc ON gc.id = s."groupClassId"
      WHERE r.id = ${resourceId}::uuid
        AND (r.visibility = 'ALL_STUDENTS' OR EXISTS (
          SELECT 1 FROM resource_targets t
          WHERE t."resourceId" = r.id
            AND ((r.visibility = 'GROUP_CLASS' AND t."groupClassId" = s."groupClassId")
              OR (r.visibility = 'GROUP' AND t."groupId" = gc."groupId"))))
      ON CONFLICT DO NOTHING`;
  }

  /** Accounts reached by the announcement (same rules as the announcement read filters). */
  async notifyAnnouncement(tx: Tx, announcementId: string, title: string) {
    return tx.$executeRaw`
      INSERT INTO notifications (id, "userId", type, title, message, "announcementId")
      SELECT uuidv7(), r.id, ${NotificationType.ANNOUNCEMENT_PUBLISHED}::"NotificationType",
             'إعلان جديد', ${`تم نشر إعلان: ${title}`}, ${announcementId}::uuid
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
      ON CONFLICT DO NOTHING`;
  }

  /**
   * The user's notifications, newest first. Notifications of a scheduled
   * announcement appear from its publication day.
   */
  async list(
    userId: string,
    query: NotificationListQueryDto,
  ): Promise<NotificationListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where = {
      ...(await this.visibleWhere(userId)),
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
    return {
      data: rows.map(toDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async unreadCount(userId: string): Promise<UnreadCountDto> {
    return {
      count: await this.prisma.notification.count({
        where: { ...(await this.visibleWhere(userId)), readAt: null },
      }),
    };
  }

  /** Idempotent: an already-read notification keeps its first readAt. */
  async markRead(userId: string, id: string): Promise<NotificationDto> {
    // Another user's notification is indistinguishable from a missing one
    const where = { id, ...(await this.visibleWhere(userId)) };
    await this.prisma.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.prisma.notification.findFirst({ where, select });
    if (!row) throw notificationNotFound();
    return toDto(row);
  }

  async markAllRead(userId: string): Promise<ReadAllResultDto> {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...(await this.visibleWhere(userId)), readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  private async visibleWhere(
    userId: string,
  ): Promise<Prisma.NotificationWhereInput> {
    const today = toDbDate(await platformToday(this.prisma));
    return {
      userId,
      OR: [
        { announcementId: null },
        { announcement: { publishedAt: { lte: today } } },
      ],
    };
  }
}
