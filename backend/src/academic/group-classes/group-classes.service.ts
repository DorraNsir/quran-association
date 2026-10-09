import { Injectable } from '@nestjs/common';

import {
  badRequest,
  conflict,
  notFound,
  violatesConstraint,
} from '../../common/errors.js';
import { PageSizeService } from '../../common/page-size.service.js';
import { paginationMeta } from '../../common/pagination.js';
import {
  ActivationStatus,
  type Prisma,
  RecordStatus,
} from '../../generated/prisma/client.js';
import { platformToday } from '../../common/platform-clock.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScheduleConflictService } from '../../scheduling/schedule-conflicts.service.js';
import { branchNotFound } from '../branches/branches.service.js';
import { groupNotFound } from '../groups/groups.service.js';
import {
  assignedToTeacher,
  classBriefSelect,
  roomsOfSlots,
  personNameSelect,
} from '../teacher-assignments.js';
import type {
  CreateGroupClassDto,
  GroupClassDetailDto,
  GroupClassDto,
  GroupClassListDto,
  GroupClassListQueryDto,
  UpdateGroupClassDto,
} from './group-class.dto.js';

type Tx = Prisma.TransactionClient;

const teacherSelect = {
  id: true,
  status: true,
  person: { select: personNameSelect },
} satisfies Prisma.TeacherSelect;

const select = {
  ...classBriefSelect,
  supervisor: { select: teacherSelect },
  assistants: {
    select: { teacher: { select: teacherSelect } },
    orderBy: { assignedAt: 'asc' },
  },
  _count: { select: { students: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.GroupClassSelect;

type Row = Prisma.GroupClassGetPayload<{ select: typeof select }>;
type TeacherRow = Prisma.TeacherGetPayload<{ select: typeof teacherSelect }>;

const teacherRef = (t: TeacherRow) => ({
  id: t.id,
  firstName: t.person.firstName,
  lastName: t.person.lastName,
  photoUrl: t.person.photoUrl,
  status: t.status,
});

function toDto(c: Row): GroupClassDto {
  return {
    id: c.id,
    status: c.status,
    group: c.group,
    branch: c.branch,
    rooms: roomsOfSlots(c.schedules),
    supervisor: teacherRef(c.supervisor),
    assistants: c.assistants.map((a) => teacherRef(a.teacher)),
    activeStudentsCount: c._count.students,
  };
}

export const classNotFound = () =>
  notFound('GROUP_CLASS_NOT_FOUND', 'القسم غير موجود');

/**
 * GroupClass = the operational class. Rules (service + database):
 *  - the room belongs to the class's branch (composite FK rooms(id, branchId));
 *  - exactly one supervisor (GroupClass.supervisorId);
 *  - assistants unique (PK) and never the supervisor (service + trigger);
 *  - an ACTIVE class needs an active group, branch, room and teachers
 *    (teachers are only checked when NEWLY assigned).
 *
 * Part 10.5 hook points (schedule conflict validation, ROOM + TEACHER overlap):
 * create (ACTIVE), update when branch/room/supervisor/assistants change, and
 * setStatus → ACTIVE must check this class's weekly slots against the other
 * ACTIVE classes of the same room and of the same teachers. Deactivating or
 * archiving never cancels sessions automatically.
 */
@Injectable()
export class GroupClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
    private readonly conflicts: ScheduleConflictService,
  ) {}

  async list(query: GroupClassListQueryDto): Promise<GroupClassListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.GroupClassWhereInput = {
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.roomId
        ? { schedules: { some: { roomId: query.roomId } } }
        : {}),
      ...(query.supervisorId ? { supervisorId: query.supervisorId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.teacherId ? assignedToTeacher(query.teacherId) : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.groupClass.count({ where }),
      this.prisma.groupClass.findMany({
        where,
        select,
        orderBy: [
          { group: { name: 'asc' } },
          { branch: { name: 'asc' } },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<GroupClassDetailDto> {
    const row = await this.prisma.groupClass.findUnique({
      where: { id },
      select: {
        ...select,
        students: {
          where: { status: { not: RecordStatus.ARCHIVED } },
          select: {
            id: true,
            status: true,
            person: { select: personNameSelect },
          },
          orderBy: [
            { person: { lastName: 'asc' } },
            { person: { firstName: 'asc' } },
          ],
        },
      },
    });
    if (!row) throw classNotFound();
    return Object.assign(toDto(row), {
      students: row.students.map((s) => ({
        id: s.id,
        status: s.status,
        firstName: s.person.firstName,
        lastName: s.person.lastName,
        photoUrl: s.person.photoUrl,
      })),
    });
  }

  async create(dto: CreateGroupClassDto): Promise<GroupClassDetailDto> {
    const assistants = dto.assistantTeacherIds ?? [];
    const status = dto.status ?? RecordStatus.ACTIVE;
    const id = await this.write(() =>
      this.prisma.$transaction(async (tx) => {
        const group = await tx.group.findUnique({
          where: { id: dto.groupId },
          select: { status: true },
        });
        if (!group) throw groupNotFound();
        if (
          group.status === RecordStatus.ARCHIVED ||
          (status === RecordStatus.ACTIVE &&
            group.status !== RecordStatus.ACTIVE)
        ) {
          throw conflict(
            'GROUP_INACTIVE',
            'لا يمكن فتح قسم نشط في مجموعة غير مفعّلة',
          );
        }
        await this.assertBranch(tx, dto.branchId, status);
        this.assertStaffShape(dto.supervisorId, assistants);
        await this.assertTeachersAssignable(tx, [
          dto.supervisorId,
          ...assistants,
        ]);
        const created = await tx.groupClass.create({
          data: {
            groupId: dto.groupId,
            branchId: dto.branchId,
            supervisorId: dto.supervisorId,
            status,
            assistants: {
              create: assistants.map((teacherId) => ({ teacherId })),
            },
          },
          select: { id: true },
        });
        return created.id;
      }),
    );
    return this.get(id);
  }

  /**
   * Relocation and re-staffing in one locked transaction (assistant list =
   * full replacement). Weekly slots can get new rooms (scheduleRooms) — and
   * MUST all get one of the new branch when the branch changes; the slots'
   * upcoming scheduled sessions follow, history keeps its rooms.
   */
  async update(
    id: string,
    dto: UpdateGroupClassDto,
  ): Promise<GroupClassDetailDto> {
    await this.write(() =>
      this.prisma.$transaction(async (tx) => {
        const current = await this.lock(tx, id);
        const branchId = dto.branchId ?? current.branchId;
        const supervisorId = dto.supervisorId ?? current.supervisorId;
        const currentAssistants = current.assistants.map((a) => a.teacherId);
        const assistants = dto.assistantTeacherIds ?? currentAssistants;

        if (branchId !== current.branchId)
          await this.assertBranch(tx, branchId, current.status);
        const rooms = await this.slotRooms(
          tx,
          id,
          branchId,
          branchId !== current.branchId,
          dto.scheduleRooms ?? [],
          current.status === RecordStatus.ACTIVE,
        );
        this.assertStaffShape(supervisorId, assistants);
        // Only NEW assignments must be active teachers (existing ones are kept as they are)
        const added = [
          ...(supervisorId !== current.supervisorId ? [supervisorId] : []),
          ...assistants.filter((t) => !currentAssistants.includes(t)),
        ];
        await this.assertTeachersAssignable(tx, added);

        // Same weekly slots / upcoming sessions, new rooms or team: must not create conflicts
        const teamChanged =
          supervisorId !== current.supervisorId ||
          assistants.length !== currentAssistants.length ||
          assistants.some((t) => !currentAssistants.includes(t));
        const today = await platformToday(tx);
        if (teamChanged || rooms.size > 0) {
          await this.conflicts.assertClassOccupancyFree(
            tx,
            { groupClassId: id, teacherIds: [supervisorId, ...assistants] },
            today,
            {
              checkWeekly:
                current.status === RecordStatus.ACTIVE &&
                current.group.status === RecordStatus.ACTIVE,
              roomOverrides: rooms,
            },
          );
        }

        if (dto.assistantTeacherIds) {
          await tx.groupClassAssistant.deleteMany({
            where: { groupClassId: id, teacherId: { notIn: assistants } },
          });
        }
        await tx.groupClass.update({
          where: { id },
          data: { branchId, supervisorId },
        });
        for (const [scheduleId, roomId] of rooms)
          await tx.weeklySchedule.update({
            where: { id: scheduleId },
            data: { roomId },
          });
        if (dto.assistantTeacherIds) {
          await tx.groupClassAssistant.createMany({
            data: assistants.map((teacherId) => ({
              groupClassId: id,
              teacherId,
            })),
            skipDuplicates: true,
          });
        }
        // Upcoming SCHEDULED sessions follow (history keeps its snapshot)
        if (rooms.size > 0)
          await this.conflicts.syncSlotRooms(tx, rooms, today);
        if (teamChanged)
          await this.conflicts.syncUpcomingSessions(tx, id, today);
        return id;
      }),
    );
    return this.get(id);
  }

  /** (Re)activation re-checks group, branch, the rooms of its weekly slots and supervisor. Students stay assigned. */
  async setStatus(
    id: string,
    status: RecordStatus,
  ): Promise<GroupClassDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, id);
      if (
        status === RecordStatus.ACTIVE &&
        current.status !== RecordStatus.ACTIVE
      ) {
        const group = await tx.group.findUniqueOrThrow({
          where: { id: current.groupId },
          select: { status: true },
        });
        if (group.status !== RecordStatus.ACTIVE)
          throw conflict(
            'GROUP_INACTIVE',
            'لا يمكن تفعيل قسم في مجموعة غير مفعّلة',
          );
        await this.assertBranch(tx, current.branchId, status);
        const inactiveRoom = await tx.weeklySchedule.findFirst({
          where: {
            groupClassId: id,
            room: { status: { not: ActivationStatus.ACTIVE } },
          },
          select: { id: true },
        });
        if (inactiveRoom)
          throw conflict(
            'ROOM_INACTIVE',
            'إحدى قاعات المواعيد الأسبوعية غير مفعّلة: غيّر قاعة الموعد أولًا',
          );
        await this.assertTeachersAssignable(tx, [current.supervisorId]);
        // Its weekly slots start occupying their rooms and the teachers again
        await this.conflicts.assertClassOccupancyFree(
          tx,
          {
            groupClassId: id,
            teacherIds: [
              current.supervisorId,
              ...current.assistants.map((a) => a.teacherId),
            ],
          },
          await platformToday(tx),
          { checkWeekly: true },
        );
      }
      await tx.groupClass.update({ where: { id }, data: { status } });
    });
    return this.get(id);
  }

  // ───────────────────────── rules ─────────────────────────

  /** Scheduling lock (room/team/activation affect occupancy) + row lock. */
  private async lock(tx: Tx, id: string) {
    await this.conflicts.lockScheduling(tx);
    await tx.$queryRaw`SELECT id FROM group_classes WHERE id = ${id}::uuid FOR UPDATE`;
    const current = await tx.groupClass.findUnique({
      where: { id },
      select: {
        groupId: true,
        branchId: true,
        supervisorId: true,
        status: true,
        group: { select: { status: true } },
        assistants: { select: { teacherId: true } },
      },
    });
    if (!current) throw classNotFound();
    return current;
  }

  private async assertBranch(tx: Tx, branchId: string, status: RecordStatus) {
    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { status: true },
    });
    if (!branch) throw branchNotFound();
    if (
      status === RecordStatus.ACTIVE &&
      branch.status !== ActivationStatus.ACTIVE
    )
      throw conflict('BRANCH_INACTIVE', 'الفرع غير مفعّل');
  }

  /**
   * The requested slot rooms (scheduleId → roomId), validated: slots of THIS
   * class, rooms of `branchId` (active for an active class). On a branch
   * change every slot of the class must be given a room of the new branch.
   */
  private async slotRooms(
    tx: Tx,
    groupClassId: string,
    branchId: string,
    branchChanged: boolean,
    requested: { scheduleId: string; roomId: string }[],
    requireActive: boolean,
  ): Promise<Map<string, string>> {
    const slots = await tx.weeklySchedule.findMany({
      where: { groupClassId },
      select: { id: true, roomId: true },
    });
    const own = new Map(slots.map((s) => [s.id, s.roomId]));
    const rooms = new Map<string, string>();
    for (const r of requested) {
      if (!own.has(r.scheduleId))
        throw badRequest(
          'SCHEDULE_NOT_IN_CLASS',
          'أحد المواعيد الأسبوعية لا ينتمي إلى هذا القسم',
        );
      if (own.get(r.scheduleId) !== r.roomId || branchChanged)
        rooms.set(r.scheduleId, r.roomId);
    }
    if (branchChanged && slots.some((s) => !rooms.has(s.id)))
      throw badRequest(
        'SCHEDULE_ROOMS_REQUIRED',
        'عند تغيير الفرع اختر لكل موعد أسبوعي قاعة من الفرع الجديد',
      );
    for (const roomId of new Set(rooms.values()))
      await this.conflicts.assertRoomForClass(tx, roomId, branchId, {
        requireActive,
      });
    return rooms;
  }

  private assertStaffShape(supervisorId: string, assistants: string[]) {
    if (new Set(assistants).size !== assistants.length) {
      throw badRequest('DUPLICATE_ASSISTANT', 'لا يمكن تكرار المعلم المساعد');
    }
    if (assistants.includes(supervisorId)) {
      throw badRequest(
        'SUPERVISOR_IS_ASSISTANT',
        'المعلم المشرف لا يمكن أن يكون مساعدًا في القسم نفسه',
      );
    }
  }

  /** Every listed teacher exists and is ACTIVE. */
  private async assertTeachersAssignable(tx: Tx, teacherIds: string[]) {
    const ids = [...new Set(teacherIds)];
    if (ids.length === 0) return;
    const found = await tx.teacher.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    if (found.length !== ids.length)
      throw notFound('TEACHER_NOT_FOUND', 'معلم غير موجود');
    if (found.some((t) => t.status !== ActivationStatus.ACTIVE)) {
      throw conflict('TEACHER_INACTIVE', 'لا يمكن إسناد قسم إلى معلم غير نشط');
    }
  }

  /** Database backstops (composite FK, trigger) mapped to the same domain errors. */
  private async write<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      if (violatesConstraint(error, 'group_class_supervisor_not_assistant')) {
        throw badRequest(
          'SUPERVISOR_IS_ASSISTANT',
          'المعلم المشرف لا يمكن أن يكون مساعدًا في القسم نفسه',
        );
      }
      throw error;
    }
  }
}
