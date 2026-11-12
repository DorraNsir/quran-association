import { ConflictException, Injectable } from '@nestjs/common';

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
import {
  classesConcerned,
  notifyClassChanges,
  snapshotClasses,
} from '../../communication/structure-notifications.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScheduleConflictService } from '../../scheduling/schedule-conflicts.service.js';
import {
  scheduleNotFound,
  SchedulesService,
} from '../../scheduling/schedules.service.js';
import { SessionsService } from '../../scheduling/sessions.service.js';
import { fromDbTime } from '../../scheduling/time.js';
import { branchNotFound } from '../branches/branches.service.js';
import { groupNotFound } from '../groups/groups.service.js';
import {
  assignedToTeacher,
  classBriefSelect,
  roomsOfSlots,
  personNameSelect,
} from '../teacher-assignments.js';
import type {
  ClassSlotDto,
  CreateGroupClassDto,
  GroupClassDetailDto,
  GroupClassDto,
  GroupClassListDto,
  GroupClassListQueryDto,
  MoveBlockDto,
  MoveGroupClassPreviewDto,
  SaveGroupClassDto,
  UpdateGroupClassDto,
} from './group-class.dto.js';

type Tx = Prisma.TransactionClient;

/** A save rebuilds weekly slots and their sessions: longer than the default 5 s. */
const SAVE_TX = { timeout: 60_000 };

/** What the class form shows of a class (compared with what it asks for). */
interface ClassState {
  version: number;
  branchId: string;
  status: RecordStatus;
  supervisorId: string;
  assistantTeacherIds: string[];
  slots: Required<ClassSlotDto>[];
}

const slotKey = (s: Omit<ClassSlotDto, 'id'>) =>
  `${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.roomId}`;

/**
 * Whether the class already is as asked: same branch, status and team, every
 * listed slot as it is, and the slots it hosts without one in the list
 * exactly the new ones asked for (a save that was applied, then sent again).
 */
function alreadySaved(current: ClassState, desired: SaveGroupClassDto) {
  const sameTeam =
    current.supervisorId === desired.supervisorId &&
    current.assistantTeacherIds.length === desired.assistantTeacherIds.length &&
    desired.assistantTeacherIds.every((t) =>
      current.assistantTeacherIds.includes(t),
    );
  if (
    current.branchId !== desired.branchId ||
    current.status !== desired.status ||
    !sameTeam
  )
    return false;
  const byId = new Map(current.slots.map((s) => [s.id, s]));
  for (const s of desired.slots.filter((x) => x.id)) {
    const now = byId.get(s.id!);
    if (!now || slotKey(now) !== slotKey(s)) return false;
    byId.delete(s.id!);
  }
  const rest = [...byId.values()].map(slotKey).sort();
  const added = desired.slots
    .filter((x) => !x.id)
    .map(slotKey)
    .sort();
  return rest.join() === added.join();
}

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
  version: true,
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
    version: c.version,
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
    private readonly sessions: SessionsService,
    private readonly schedules: SchedulesService,
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

  /** The class, and its weekly slots when given, in one transaction (all or nothing). */
  async create(
    dto: CreateGroupClassDto,
    actorUserId?: string,
  ): Promise<GroupClassDetailDto> {
    const id = await this.write(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await this.createInTx(tx, dto);
        for (const slot of dto.slots ?? []) {
          if (slot.id) throw scheduleNotFound();
          await this.schedules.createInTx(tx, created, slot);
        }
        // Other admins and its teachers are told (a new class: nothing before)
        await notifyClassChanges(tx, {
          actorUserId,
          before: new Map(),
          after: await snapshotClasses(tx, [created]),
        });
        return created;
      }, SAVE_TX),
    );
    return this.get(id);
  }

  /**
   * One operation on a class, its people told what changed: the class locked,
   * the classes it can touch (its shared slots' classes too) read before and
   * after, at most one notification per person, in the same transaction.
   * Used by each public operation once — never by the shared `…InTx` steps.
   */
  private async notifying<T>(
    tx: Tx,
    id: string,
    actorUserId: string | undefined,
    op: () => Promise<T>,
  ): Promise<T> {
    await this.lock(tx, id);
    const concerned = await classesConcerned(tx, id);
    const before = await snapshotClasses(tx, concerned);
    const result = await op();
    await notifyClassChanges(tx, {
      actorUserId,
      before,
      after: await snapshotClasses(tx, concerned),
    });
    return result;
  }

  /**
   * «حفظ القسم»: the class form's whole desired state in ONE transaction —
   * every step is the same checked operation as its own endpoint (no rule is
   * duplicated), so any refusal undoes all of them. Locks are taken in the
   * order every class / slot write uses: the scheduling lock, then the class
   * row. A class already as asked (a double click, a retried request) changes
   * nothing, whatever version is sent; otherwise a version other than the
   * current one is refused (another save meanwhile), nothing written.
   */
  async save(
    id: string,
    dto: SaveGroupClassDto,
    actorUserId?: string,
  ): Promise<GroupClassDetailDto> {
    await this.write(() =>
      this.prisma.$transaction(
        (tx) => this.saveInTx(tx, id, dto, actorUserId),
        SAVE_TX,
      ),
    );
    return this.get(id);
  }

  private async saveInTx(
    tx: Tx,
    id: string,
    dto: SaveGroupClassDto,
    actorUserId?: string,
  ) {
    await this.lock(tx, id);
    const current = await this.stateOf(tx, id);
    // Already as asked (a repeated request): nothing written, nobody notified
    if (alreadySaved(current, dto)) return;
    if (dto.version !== current.version)
      throw conflict(
        'GROUP_CLASS_CHANGED',
        'عدّل مستخدم آخر هذا القسم منذ فتح النموذج: لم يُحفظ شيء. أغلق النموذج وأعد فتحه لرؤية آخر التعديلات، ثم أعد التعديل.',
      );
    // The whole save, then ONE notification per person about all of it
    await this.notifying(tx, id, actorUserId, () =>
      this.applySave(tx, id, dto, current),
    );
  }

  /** The steps of a save (checked above): each refusal undoes them all. */
  private async applySave(
    tx: Tx,
    id: string,
    dto: SaveGroupClassDto,
    current: ClassState,
  ) {
    const hosted = new Map(current.slots.map((s) => [s.id, s]));
    if (dto.slots.some((s) => s.id && !hosted.has(s.id)))
      throw scheduleNotFound();
    const kept = dto.slots.filter((s) => s.id);
    const keptIds = new Set(kept.map((s) => s.id));

    // The order the form always used: removed slots first (their times are
    // free again), the class (branch + team; on a branch change every kept
    // slot's room of the new branch with it), its status, then the kept and
    // new slots
    for (const slot of current.slots.filter((s) => !keptIds.has(s.id)))
      await this.schedules.removeInTx(tx, id, slot.id);
    const branchChanged = dto.branchId !== current.branchId;
    const teamChanged =
      dto.supervisorId !== current.supervisorId ||
      dto.assistantTeacherIds.length !== current.assistantTeacherIds.length ||
      dto.assistantTeacherIds.some(
        (t) => !current.assistantTeacherIds.includes(t),
      );
    if (branchChanged || teamChanged)
      await this.updateInTx(tx, id, {
        branchId: dto.branchId,
        supervisorId: dto.supervisorId,
        assistantTeacherIds: dto.assistantTeacherIds,
        ...(branchChanged && {
          scheduleRooms: kept.map((s) => ({
            scheduleId: s.id!,
            roomId: s.roomId,
          })),
        }),
      });
    if (dto.status !== current.status)
      await this.setStatusInTx(tx, id, dto.status);
    for (const slot of kept) {
      const before = hosted.get(slot.id!)!;
      const moved =
        slot.dayOfWeek !== before.dayOfWeek ||
        slot.startTime !== before.startTime ||
        slot.endTime !== before.endTime;
      const newRoom = !branchChanged && slot.roomId !== before.roomId;
      if (moved || newRoom)
        await this.schedules.updateInTx(tx, id, slot.id!, {
          ...(moved && {
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
          }),
          ...(newRoom && { roomId: slot.roomId }),
        });
    }
    for (const slot of dto.slots.filter((s) => !s.id))
      await this.schedules.createInTx(tx, id, slot);

    // The result must be exactly what was asked (else nothing is kept)
    if (!alreadySaved(await this.stateOf(tx, id), dto))
      throw conflict(
        'GROUP_CLASS_SAVE_MISMATCH',
        'تعذّر حفظ القسم كما طُلب: لم يُحفظ شيء. أعد فتح النموذج وحاول مجددًا.',
      );
  }

  /** The class as its form shows it: team, status, branch and the slots it hosts. */
  private async stateOf(tx: Tx, id: string): Promise<ClassState> {
    const c = await tx.groupClass.findUniqueOrThrow({
      where: { id },
      select: {
        version: true,
        branchId: true,
        status: true,
        supervisorId: true,
        assistants: { select: { teacherId: true } },
        schedules: {
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            roomId: true,
          },
        },
      },
    });
    return {
      version: c.version,
      branchId: c.branchId,
      status: c.status,
      supervisorId: c.supervisorId,
      assistantTeacherIds: c.assistants.map((a) => a.teacherId),
      slots: c.schedules.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: fromDbTime(s.startTime),
        endTime: fromDbTime(s.endTime),
        roomId: s.roomId,
      })),
    };
  }

  /** create() inside a caller's transaction; returns the new class's id. */
  async createInTx(tx: Tx, dto: CreateGroupClassDto): Promise<string> {
    const assistants = dto.assistantTeacherIds ?? [];
    const status = dto.status ?? RecordStatus.ACTIVE;
    const group = await tx.group.findUnique({
      where: { id: dto.groupId },
      select: { status: true },
    });
    if (!group) throw groupNotFound();
    if (
      group.status === RecordStatus.ARCHIVED ||
      (status === RecordStatus.ACTIVE && group.status !== RecordStatus.ACTIVE)
    ) {
      throw conflict(
        'GROUP_INACTIVE',
        'لا يمكن فتح قسم نشط في مجموعة غير مفعّلة',
      );
    }
    await this.assertBranch(tx, dto.branchId, status);
    this.assertStaffShape(dto.supervisorId, assistants);
    await this.assertTeachersAssignable(tx, [dto.supervisorId, ...assistants]);
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
    actorUserId?: string,
  ): Promise<GroupClassDetailDto> {
    await this.write(() =>
      this.prisma.$transaction((tx) =>
        this.notifying(tx, id, actorUserId, () => this.updateInTx(tx, id, dto)),
      ),
    );
    return this.get(id);
  }

  /** update() inside a caller's transaction (which may already hold the class lock). */
  async updateInTx(
    tx: Tx,
    id: string,
    dto: UpdateGroupClassDto,
  ): Promise<string> {
    const current = await this.lock(tx, id);
    const branchId = dto.branchId ?? current.branchId;
    const supervisorId = dto.supervisorId ?? current.supervisorId;
    const currentAssistants = current.assistants.map((a) => a.teacherId);
    const assistants = dto.assistantTeacherIds ?? currentAssistants;

    if (branchId !== current.branchId)
      await this.assertBranch(tx, branchId, current.status);
    const today = await platformToday(tx);
    // «الحصص المشتركة»: a shared slot / lesson needs one supervisor and one
    // branch — the admin first removes the class from them (history stays)
    if (
      supervisorId !== current.supervisorId ||
      branchId !== current.branchId
    ) {
      const shared = await this.conflicts.sharedParticipation(tx, id, today);
      if (shared.schedules > 0 || shared.sessions > 0)
        throw supervisorId !== current.supervisorId
          ? conflict(
              'SHARED_SUPERVISOR_CHANGE_BLOCKED',
              'هذا القسم مشارك في مواعيد أو حصص مشتركة قادمة: أزله منها أو عدّلها أولًا، ثم غيّر المعلم المشرف',
            )
          : conflict(
              'SHARED_BRANCH_CHANGE_BLOCKED',
              'هذا القسم مشارك في مواعيد أو حصص مشتركة قادمة: أزله منها أو عدّلها أولًا، ثم غيّر الفرع',
            );
    }
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
    if (rooms.size > 0) await this.conflicts.syncSlotRooms(tx, rooms, today);
    if (teamChanged) await this.conflicts.syncUpcomingSessions(tx, id, today);
    // A class skipped by an earlier generation (its supervisor was
    // inactive then) gets its missing sessions from its new supervisor
    if (supervisorId !== current.supervisorId)
      await this.sessions.generateForCurrentYear(tx, { groupClassId: id });
    return id;
  }

  /** (Re)activation re-checks group, branch, the rooms of its weekly slots and supervisor. Students stay assigned. */
  async setStatus(
    id: string,
    status: RecordStatus,
    actorUserId?: string,
  ): Promise<GroupClassDetailDto> {
    await this.prisma.$transaction(
      (tx) =>
        this.notifying(tx, id, actorUserId, () =>
          this.setStatusInTx(tx, id, status),
        ),
      { timeout: 30_000 },
    );
    return this.get(id);
  }

  /** setStatus() inside a caller's transaction (which may already hold the class lock). */
  async setStatusInTx(tx: Tx, id: string, status: RecordStatus) {
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
    // (Re)activated: its sessions until the end of the current academic year
    if (
      status === RecordStatus.ACTIVE &&
      current.status !== RecordStatus.ACTIVE
    )
      await this.sessions.generateForCurrentYear(tx, { groupClassId: id });
  }

  // ─────────────── «نقل القسم إلى مجموعة أخرى» ───────────────

  /** What moving the class to `groupId` would do (read-only). */
  async movePreview(
    id: string,
    groupId: string,
  ): Promise<MoveGroupClassPreviewDto> {
    return this.movePlan(this.prisma, id, groupId);
  }

  /**
   * Corrects the group of a class created under the wrong one: only a class
   * that never had a student nor any recorded activity, whose running state
   * stays the same. Only `groupId` changes (same id, teachers, branch,
   * weekly slots and planned sessions); the move is recorded. Everything is
   * checked again here, under locks: the class row (FOR UPDATE — enrollment
   * paths take it FOR SHARE first; FK inserts wait for it), the sessions it
   * takes part in (attendance / completion / work writers lock them), both
   * groups (their status), and the scheduling lock.
   */
  async move(
    id: string,
    groupId: string,
    actorUserId: string,
  ): Promise<GroupClassDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      // Its people told the new group (other admins, its teachers)
      const concerned = await classesConcerned(tx, id);
      const before = await snapshotClasses(tx, concerned);
      await tx.$queryRaw`SELECT s.id FROM sessions s
        WHERE s."groupClassId" = ${id}::uuid
           OR EXISTS (SELECT 1 FROM session_classes sc
                      WHERE sc."sessionId" = s.id AND sc."groupClassId" = ${id}::uuid)
        FOR UPDATE`;
      const plan = await this.movePlan(tx, id, groupId, { lockGroups: true });
      if (!plan.eligible)
        throw new ConflictException({
          code: 'GROUP_CLASS_MOVE_REFUSED',
          message: `لا يمكن نقل هذا القسم: ${plan.blocks.map((b) => b.message).join('؛ ')}`,
          blocks: plan.blocks,
        });
      await tx.groupClass.update({ where: { id }, data: { groupId } });
      await tx.groupClassMove.create({
        data: {
          groupClassId: id,
          fromGroupId: plan.from.id,
          toGroupId: groupId,
          movedByUserId: actorUserId,
        },
      });
      await notifyClassChanges(tx, {
        actorUserId,
        before,
        after: await snapshotClasses(tx, concerned),
      });
    });
    return this.get(id);
  }

  private async movePlan(
    db: Tx,
    id: string,
    groupId: string,
    options: { lockGroups?: boolean } = {},
  ): Promise<MoveGroupClassPreviewDto> {
    const current = await db.groupClass.findUnique({
      where: { id },
      select: {
        status: true,
        groupId: true,
        supervisorId: true,
        _count: { select: { assistants: true, onboardingLinks: true } },
      },
    });
    if (!current) throw classNotFound();
    if (options.lockGroups)
      await db.$queryRaw`SELECT id FROM groups
        WHERE id IN (${current.groupId}::uuid, ${groupId}::uuid) FOR SHARE`;
    const [from, to] = await Promise.all(
      [current.groupId, groupId].map((g) =>
        db.group.findUnique({
          where: { id: g },
          select: { id: true, name: true, status: true },
        }),
      ),
    );
    if (!to) throw groupNotFound();
    const [counts] = await db.$queryRaw<
      {
        enrollments: bigint;
        attendance: bigint;
        completed: bigint;
        work: bigint;
        notes: bigint;
        submissions: bigint;
        planned: bigint;
        slots: bigint;
      }[]
    >`
      WITH s AS (
        SELECT s.id, s.status FROM sessions s
        WHERE s."groupClassId" = ${id}::uuid
           OR EXISTS (SELECT 1 FROM session_classes sc
                      WHERE sc."sessionId" = s.id AND sc."groupClassId" = ${id}::uuid))
      SELECT
        (SELECT COUNT(DISTINCT e."studentId") FROM student_enrollments e WHERE e."groupClassId" = ${id}::uuid)
          + (SELECT COUNT(*) FROM students st WHERE st."groupClassId" = ${id}::uuid
               AND NOT EXISTS (SELECT 1 FROM student_enrollments e
                               WHERE e."studentId" = st.id AND e."groupClassId" = ${id}::uuid)) AS enrollments,
        (SELECT COUNT(*) FROM s WHERE EXISTS (SELECT 1 FROM student_attendance a WHERE a."sessionId" = s.id)
            OR EXISTS (SELECT 1 FROM teacher_attendance a WHERE a."sessionId" = s.id)
            OR EXISTS (SELECT 1 FROM attendance_changes a WHERE a."sessionId" = s.id)) AS attendance,
        (SELECT COUNT(*) FROM s WHERE s.status = 'COMPLETED') AS completed,
        (SELECT COUNT(*) FROM work_programs w WHERE w."sessionId" IN (SELECT id FROM s)) AS work,
        (SELECT COUNT(*) FROM teacher_notes n WHERE n."groupClassId" = ${id}::uuid) AS notes,
        (SELECT COUNT(*) FROM onboarding_submissions o WHERE o."groupClassId" = ${id}::uuid) AS submissions,
        (SELECT COUNT(*) FROM s WHERE s.status = 'SCHEDULED') AS planned,
        (SELECT COUNT(*) FROM weekly_schedules w WHERE w."groupClassId" = ${id}::uuid
            OR EXISTS (SELECT 1 FROM weekly_schedule_classes x
                       WHERE x."weeklyScheduleId" = w.id AND x."groupClassId" = ${id}::uuid)) AS slots`;
    const n = (v: bigint) => Number(v);
    const blocks: MoveBlockDto[] = [];
    const block = (
      code: MoveBlockDto['code'],
      count: number,
      message: string,
    ) => blocks.push({ code, count, message });
    if (to.id === from!.id)
      block('SAME_GROUP', 0, 'القسم ينتمي أصلًا إلى هذه المجموعة');
    if (to.status === RecordStatus.ARCHIVED)
      block('DESTINATION_ARCHIVED', 0, 'المجموعة المختارة مؤرشفة');
    const running = (g: { status: RecordStatus }) =>
      current.status === RecordStatus.ACTIVE &&
      g.status === RecordStatus.ACTIVE;
    if (to.status !== RecordStatus.ARCHIVED && running(from!) !== running(to))
      block(
        'RUNNING_STATE_CHANGES',
        0,
        running(from!)
          ? 'المجموعة المختارة غير نشطة: سيتوقف القسم عن العمل. فعّل المجموعة أولًا أو اختر مجموعة نشطة'
          : 'المجموعة المختارة نشطة بينما المجموعة الحالية غير نشطة: سيبدأ القسم في العمل دون مراجعة مواعيده. اختر مجموعة غير نشطة أو فعّل القسم بعد نقله',
      );
    if (n(counts.enrollments))
      block(
        'HAS_STUDENTS',
        n(counts.enrollments),
        `سُجّل في هذا القسم ${n(counts.enrollments)} طالب (حاليًا أو سابقًا). أنشئ القسم في المجموعة الصحيحة، ثم انقل الطلبة إليه عبر «تغيير المجموعة» (مع تسوية مستحقاتهم)`,
      );
    if (n(counts.attendance))
      block(
        'HAS_ATTENDANCE',
        n(counts.attendance),
        `سُجّل الحضور في ${n(counts.attendance)} حصة من حصصه`,
      );
    if (n(counts.completed))
      block(
        'HAS_COMPLETED_SESSIONS',
        n(counts.completed),
        `له ${n(counts.completed)} حصة منجزة`,
      );
    if (n(counts.work))
      block('HAS_WORK', n(counts.work), 'سُجّلت أعمال «متابعة العمل» في حصصه');
    if (n(counts.notes))
      block(
        'HAS_TEACHER_NOTES',
        n(counts.notes),
        'كُتبت ملاحظات معلمين مرتبطة به',
      );
    if (n(counts.submissions))
      block(
        'HAS_ONBOARDING_SUBMISSIONS',
        n(counts.submissions),
        `وصلته ${n(counts.submissions)} استمارة «استكمال بيانات الطلبة»`,
      );
    const year = await db.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    const fee = year
      ? await db.groupFee.findFirst({
          where: { groupId: to.id, academicYearId: year.id, isActive: true },
          select: { amount: true, numberOfPeriods: true },
        })
      : null;
    return {
      groupClassId: id,
      from: from!,
      to,
      eligible: blocks.length === 0,
      blocks,
      keeps: {
        weeklySchedules: n(counts.slots),
        plannedSessions: n(counts.planned),
        teachers: 1 + current._count.assistants,
        onboardingLinks: current._count.onboardingLinks,
      },
      destinationFee: fee
        ? fee.amount.times(fee.numberOfPeriods).toFixed(3)
        : null,
    };
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
