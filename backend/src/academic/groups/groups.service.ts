import { Injectable } from '@nestjs/common';

import { conflict, isUniqueViolation, notFound } from '../../common/errors.js';
import { PageSizeService } from '../../common/page-size.service.js';
import { paginationMeta } from '../../common/pagination.js';
import { type Prisma, RecordStatus } from '../../generated/prisma/client.js';
import { platformToday } from '../../common/platform-clock.js';
import {
  type GroupSnapshot,
  notifyGroupChange,
} from '../../communication/structure-notifications.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScheduleConflictService } from '../../scheduling/schedule-conflicts.service.js';
import { SessionsService } from '../../scheduling/sessions.service.js';
import { roomsOfSlots } from '../teacher-assignments.js';
import type {
  CreateGroupDto,
  GroupDetailDto,
  GroupDto,
  GroupListDto,
  GroupListQueryDto,
  UpdateGroupDto,
} from './group.dto.js';

const select = {
  id: true,
  name: true,
  audience: true,
  status: true,
  createdAt: true,
  _count: { select: { classes: true } },
  classes: { where: { status: 'ACTIVE' }, select: { id: true } },
} satisfies Prisma.GroupSelect;

export const groupNotFound = () =>
  notFound('GROUP_NOT_FOUND', 'المجموعة غير موجودة');
const nameTaken = () => conflict('GROUP_NAME_TAKEN', 'توجد مجموعة بهذا الاسم');

/** Groups are archived/deactivated, never deleted; their classes keep their own status. */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
    private readonly conflicts: ScheduleConflictService,
    private readonly sessions: SessionsService,
  ) {}

  async list(query: GroupListQueryDto): Promise<GroupListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.GroupWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { audience: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.group.count({ where }),
      this.prisma.group.findMany({
        where,
        select,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const students = await this.activeStudentsByGroup(rows.map((g) => g.id));
    return {
      data: rows.map((g) => this.toDto(g, students.get(g.id) ?? 0)),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<GroupDetailDto> {
    const group = await this.prisma.group.findUnique({ where: { id }, select });
    if (!group) throw groupNotFound();
    const classes = await this.prisma.groupClass.findMany({
      where: { groupId: id },
      orderBy: [{ status: 'asc' }, { branch: { name: 'asc' } }],
      select: {
        id: true,
        status: true,
        branch: { select: { id: true, name: true } },
        // Each weekly slot has its own room: the class lists the rooms it uses
        schedules: {
          select: { room: { select: { id: true, name: true } } },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        },
        supervisor: {
          select: {
            person: { select: { firstName: true, lastName: true } },
            id: true,
          },
        },
        _count: {
          select: {
            assistants: true,
            students: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });
    const activeStudents = classes.reduce(
      (sum, c) => sum + c._count.students,
      0,
    );
    return Object.assign(this.toDto(group, activeStudents), {
      classes: classes.map((c) => ({
        id: c.id,
        status: c.status,
        branch: c.branch,
        rooms: roomsOfSlots(c.schedules),
        supervisor: { id: c.supervisor.id, ...c.supervisor.person },
        assistantsCount: c._count.assistants,
        activeStudentsCount: c._count.students,
      })),
    });
  }

  async create(
    dto: CreateGroupDto,
    actorUserId?: string,
  ): Promise<GroupDetailDto> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const created = await tx.group.create({
          // A new group has no class yet: any status is free of conflicts
          data: {
            name: dto.name,
            audience: dto.audience ?? null,
            ...(dto.status && { status: dto.status }),
          },
          select: { id: true, name: true, audience: true, status: true },
        });
        // The other admins are told
        await notifyGroupChange(tx, {
          actorUserId,
          before: null,
          after: created,
        });
        return created.id;
      });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  /**
   * Name / audience and, when given, the status — in ONE transaction: a
   * refused status change (conflicts on re-activation) keeps the old name too.
   */
  async update(
    id: string,
    dto: UpdateGroupDto,
    actorUserId?: string,
  ): Promise<GroupDetailDto> {
    await this.get(id);
    try {
      await this.prisma.$transaction(
        (tx) =>
          this.notifying(tx, id, actorUserId, async () => {
            await tx.group.update({
              where: { id },
              data: { name: dto.name, audience: dto.audience },
            });
            if (dto.status) await this.setStatusInTx(tx, id, dto.status);
          }),
        { timeout: 30_000 },
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
    return this.get(id);
  }

  /** Like the admin UI: the group's classes are not changed (the admin moves students first). */
  /**
   * Re-activating a group makes its ACTIVE classes run again: their weekly
   * slots and upcoming sessions must not collide with other classes.
   */
  async setStatus(
    id: string,
    status: RecordStatus,
    actorUserId?: string,
  ): Promise<GroupDetailDto> {
    await this.get(id);
    await this.prisma.$transaction(
      (tx) =>
        this.notifying(tx, id, actorUserId, () =>
          this.setStatusInTx(tx, id, status),
        ),
      { timeout: 30_000 },
    );
    return this.get(id);
  }

  /**
   * One operation on a group, its people told what changed (other admins,
   * its classes' teachers; nothing changed: nobody), in the same transaction.
   * Locks in the order every group / scheduling write uses: the scheduling
   * lock, then the group row.
   */
  private async notifying(
    tx: Prisma.TransactionClient,
    id: string,
    actorUserId: string | undefined,
    op: () => Promise<unknown>,
  ) {
    await this.conflicts.lockScheduling(tx);
    const read = async () =>
      (
        await tx.$queryRaw<GroupSnapshot[]>`
          SELECT id, name, audience, status FROM groups WHERE id = ${id}::uuid FOR UPDATE`
      )[0];
    const before = await read();
    await op();
    await notifyGroupChange(tx, { actorUserId, before, after: await read() });
  }

  /** The status read under the row lock (a concurrent change is serialized, never missed). */
  private async setStatusInTx(
    tx: Prisma.TransactionClient,
    id: string,
    status: RecordStatus,
  ) {
    await this.conflicts.lockScheduling(tx);
    const [{ status: previous }] = await tx.$queryRaw<
      { status: RecordStatus }[]
    >`SELECT status FROM groups WHERE id = ${id}::uuid FOR UPDATE`;
    if (previous === status) return;
    // Updated first so classes of THIS group also see each other as running
    // (a conflict rolls the whole transaction back)
    await tx.group.update({ where: { id }, data: { status } });
    if (status === RecordStatus.ACTIVE && previous !== RecordStatus.ACTIVE) {
      const today = await platformToday(tx);
      const classes = await tx.groupClass.findMany({
        where: { groupId: id, status: RecordStatus.ACTIVE },
        select: {
          id: true,
          supervisorId: true,
          assistants: { select: { teacherId: true } },
        },
      });
      for (const c of classes) {
        await this.conflicts.assertClassOccupancyFree(
          tx,
          {
            groupClassId: c.id,
            teacherIds: [
              c.supervisorId,
              ...c.assistants.map((a) => a.teacherId),
            ],
          },
          today,
          { checkWeekly: true },
        );
      }
      // (Re)activated: the sessions of its active classes until the end of the current academic year
      await this.sessions.generateForCurrentYear(tx, { groupId: id });
    }
  }

  private toDto(
    g: Prisma.GroupGetPayload<{ select: typeof select }>,
    activeStudentsCount: number,
  ): GroupDto {
    return {
      id: g.id,
      name: g.name,
      audience: g.audience,
      status: g.status,
      createdAt: g.createdAt,
      classesCount: g._count.classes,
      activeClassesCount: g.classes.length,
      activeStudentsCount,
    };
  }

  /** One aggregate query for the whole page (no N+1). */
  private async activeStudentsByGroup(groupIds: string[]) {
    if (groupIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.$queryRaw<
      { groupId: string; count: bigint }[]
    >`
      SELECT gc."groupId", count(*)::bigint AS count
      FROM students s JOIN group_classes gc ON gc.id = s."groupClassId"
      WHERE s.status = ${RecordStatus.ACTIVE}::"RecordStatus" AND gc."groupId" = ANY(${groupIds}::uuid[])
      GROUP BY gc."groupId"`;
    return new Map(rows.map((r) => [r.groupId, Number(r.count)]));
  }
}
