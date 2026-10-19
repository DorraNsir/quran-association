import { Injectable } from '@nestjs/common';

import { fromDbDate, fromDbDateOrNull, toDbDate } from '../common/dates.js';
import { notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import {
  ActivationStatus,
  RecordStatus,
  RegistrationRequestStatus,
  SessionStatus,
  type Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { needsAttentionWhere } from '../scheduling/sessions.service.js';
import { fromDbTime } from '../scheduling/time.js';
import { StudentAccessService } from '../student-space/student-access.service.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';
import type {
  CreateTeacherNoteDto,
  DashboardStatsDto,
  StudentWorkspaceDto,
  TeacherNoteDto,
  TeacherNoteListDto,
  TeacherNoteQueryDto,
  TeacherWorkspaceDto,
  UpdateTeacherNoteDto,
  WsStudentDto,
  WsTeacherDto,
} from './workspace.dto.js';

const personSelect = {
  firstName: true,
  lastName: true,
  gender: true,
  photoUrl: true,
} as const;

const teacherSelect = {
  id: true,
  status: true,
  joinedAt: true,
  person: { select: personSelect },
} as const;

const studentSelect = {
  id: true,
  status: true,
  registrationDate: true,
  guardianPhone: true,
  groupClassId: true,
  person: {
    select: { ...personSelect, dateOfBirth: true, phone: true },
  },
} as const;

/** A weekly slot with its participants (host + additional classes of a shared slot). */
const slotSelect = {
  id: true,
  groupClassId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  // Each weekly slot has its own room
  room: { select: { id: true, branchId: true, name: true, status: true } },
  groupClass: { select: { group: { select: { id: true, name: true } } } },
  extraClasses: {
    select: {
      groupClassId: true,
      groupClass: { select: { group: { select: { id: true, name: true } } } },
    },
    orderBy: { groupClassId: 'asc' },
  },
} as const satisfies Prisma.WeeklyScheduleSelect;

const classSelect = {
  id: true,
  groupId: true,
  branchId: true,
  supervisorId: true,
  status: true,
  assistants: { select: { teacherId: true }, orderBy: { assignedAt: 'asc' } },
  group: {
    select: {
      id: true,
      name: true,
      audience: true,
      status: true,
      createdAt: true,
    },
  },
  branch: {
    select: { id: true, name: true, address: true, phone: true, status: true },
  },
  schedules: {
    select: slotSelect,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  },
  // «الحصص المشتركة»: another class's slots this class also attends
  sharedSchedules: { select: { weeklySchedule: { select: slotSelect } } },
} as const satisfies Prisma.GroupClassSelect;

type ClassRow = Prisma.GroupClassGetPayload<{ select: typeof classSelect }>;
type TeacherRow = Prisma.TeacherGetPayload<{ select: typeof teacherSelect }>;
type StudentRow = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

const toTeacher = (t: TeacherRow): WsTeacherDto => ({
  id: t.id,
  firstName: t.person.firstName,
  lastName: t.person.lastName,
  gender: t.person.gender,
  photoUrl: t.person.photoUrl,
  status: t.status,
  joinedAt: fromDbDate(t.joinedAt),
});

const toStudent = (s: StudentRow): WsStudentDto => ({
  id: s.id,
  firstName: s.person.firstName,
  lastName: s.person.lastName,
  gender: s.person.gender,
  dateOfBirth: fromDbDateOrNull(s.person.dateOfBirth),
  phone: s.person.phone,
  guardianPhone: s.guardianPhone,
  photoUrl: s.person.photoUrl,
  registrationDate: fromDbDate(s.registrationDate),
  groupClassId: s.groupClassId,
  status: s.status,
});

const unique = <T extends { id: string }>(rows: T[]) => [
  ...new Map(rows.map((r) => [r.id, r])).values(),
];

/** What a note exposes: its text and automatic dates — never its author, a student or a class. */
const noteSelect = {
  id: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TeacherNoteSelect;

const noteNotFound = () =>
  notFound('TEACHER_NOTE_NOT_FOUND', 'الملاحظة غير موجودة');

/**
 * Read models of the teacher and student workspaces, and the teacher's
 * private notes. Scope always comes from the authenticated account
 * (TeacherAccessService / StudentAccessService), never from a client id.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherAccess: TeacherAccessService,
    private readonly studentAccess: StudentAccessService,
    private readonly pageSizes: PageSizeService,
  ) {}

  /**
   * The flat reference records of some classes (their group, branch, room,
   * team, weekly slots). A SHARED weekly slot is listed ONCE — whether the
   * classes host it or attend it as an additional class — with its
   * participants (class + group name), so it shows as one lesson.
   */
  private async bundle(classes: ClassRow[]) {
    const slots = unique(
      classes.flatMap((c) => [
        ...c.schedules,
        ...c.sharedSchedules.map((s) => s.weeklySchedule),
      ]),
    );
    const teacherIds = [
      ...new Set(
        classes.flatMap((c) => [
          c.supervisorId,
          ...c.assistants.map((a) => a.teacherId),
        ]),
      ),
    ];
    const team = await this.prisma.teacher.findMany({
      where: { id: { in: teacherIds } },
      select: teacherSelect,
    });
    return {
      branches: unique(classes.map((c) => c.branch)),
      rooms: unique(slots.map((s) => s.room)),
      groups: unique(
        classes.map((c) => ({
          ...c.group,
          createdAt: c.group.createdAt.toISOString().slice(0, 10),
        })),
      ),
      groupClasses: classes.map((c) => ({
        id: c.id,
        groupId: c.groupId,
        branchId: c.branchId,
        supervisorId: c.supervisorId,
        assistantIds: c.assistants.map((a) => a.teacherId),
        status: c.status,
      })),
      teachers: team.map(toTeacher),
      schedules: slots.map((s) => ({
        id: s.id,
        groupClassId: s.groupClassId,
        additionalGroupClassIds: s.extraClasses.map((e) => e.groupClassId),
        participants: [
          { groupClassId: s.groupClassId, group: s.groupClass.group },
          ...s.extraClasses.map((e) => ({
            groupClassId: e.groupClassId,
            group: e.groupClass.group,
          })),
        ],
        roomId: s.room.id,
        dayOfWeek: s.dayOfWeek,
        startTime: fromDbTime(s.startTime),
        endTime: fromDbTime(s.endTime),
      })),
    };
  }

  /** My current (non-archived) classes, their reference data and their current students. */
  async teacherWorkspace(userId: string): Promise<TeacherWorkspaceDto> {
    const teacherId = await this.teacherAccess.teacherIdOf(userId);
    const [teacher, classes] = await Promise.all([
      this.prisma.teacher.findUniqueOrThrow({
        where: { id: teacherId },
        select: teacherSelect,
      }),
      this.prisma.groupClass.findMany({
        where: {
          status: { not: RecordStatus.ARCHIVED },
          OR: [
            { supervisorId: teacherId },
            { assistants: { some: { teacherId } } },
          ],
        },
        select: classSelect,
        orderBy: [{ group: { name: 'asc' } }, { id: 'asc' }],
      }),
    ]);
    const students = await this.prisma.student.findMany({
      where: {
        groupClassId: { in: classes.map((c) => c.id) },
        status: { not: RecordStatus.ARCHIVED },
      },
      select: studentSelect,
      orderBy: [
        { person: { lastName: 'asc' } },
        { person: { firstName: 'asc' } },
      ],
    });
    return {
      teacher: toTeacher(teacher),
      ...(await this.bundle(classes)),
      students: students.map(toStudent),
    };
  }

  /** My own profile and my CURRENT class (with its group, branch, room, team, weekly slots). */
  async studentWorkspace(userId: string): Promise<StudentWorkspaceDto> {
    const scope = await this.studentAccess.scopeOf(userId);
    const [student, classes] = await Promise.all([
      this.prisma.student.findUniqueOrThrow({
        where: { id: scope.studentId },
        select: {
          ...studentSelect,
          cin: true,
          person: {
            select: {
              ...studentSelect.person.select,
              address: true,
              email: true,
            },
          },
        },
      }),
      scope.groupClassId
        ? this.prisma.groupClass.findMany({
            where: { id: scope.groupClassId },
            select: classSelect,
          })
        : Promise.resolve([]),
    ]);
    return {
      student: Object.assign(toStudent(student), {
        address: student.person.address,
        email: student.person.email,
        cin: student.cin,
      }),
      ...(await this.bundle(classes)),
    };
  }

  // ───────────────────────── teacher notes ─────────────────────────

  /**
   * «ملاحظاتي»: the teacher's PRIVATE notebook. A note belongs to the
   * authenticated teacher (never chosen by the client) and only its author
   * can read, change or delete it — another teacher's note simply does not
   * exist for them (404), and no admin or student route returns notes.
   * Most recently updated first; dates are automatic.
   */
  async notes(
    userId: string,
    query: TeacherNoteQueryDto,
  ): Promise<TeacherNoteListDto> {
    const teacherId = await this.teacherAccess.teacherIdOf(userId);
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where: Prisma.TeacherNoteWhereInput = { teacherId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.teacherNote.count({ where }),
      this.prisma.teacherNote.findMany({
        where,
        select: noteSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { data: rows, meta: paginationMeta(query.page, pageSize, total) };
  }

  async createNote(
    userId: string,
    dto: CreateTeacherNoteDto,
  ): Promise<TeacherNoteDto> {
    const teacherId = await this.teacherAccess.teacherIdOf(userId);
    return this.prisma.teacherNote.create({
      data: { teacherId, content: dto.content },
      select: noteSelect,
    });
  }

  async updateNote(
    userId: string,
    id: string,
    dto: UpdateTeacherNoteDto,
  ): Promise<TeacherNoteDto> {
    const teacherId = await this.teacherAccess.teacherIdOf(userId);
    // The author is part of the WHERE: someone else's note does not exist for this teacher
    const { count } = await this.prisma.teacherNote.updateMany({
      where: { id, teacherId },
      data: { content: dto.content },
    });
    if (count === 0) throw noteNotFound();
    return this.prisma.teacherNote.findUniqueOrThrow({
      where: { id },
      select: noteSelect,
    });
  }

  async deleteNote(userId: string, id: string): Promise<void> {
    const teacherId = await this.teacherAccess.teacherIdOf(userId);
    const { count } = await this.prisma.teacherNote.deleteMany({
      where: { id, teacherId },
    });
    if (count === 0) throw noteNotFound();
  }

  // ───────────────────────── admin dashboard ─────────────────────────

  /** Counts only (no personal data): the admin home page's key figures. */
  async dashboard(): Promise<DashboardStatsDto> {
    const today = await platformToday(this.prisma);
    const since = new Date(toDbDate(today));
    since.setUTCDate(since.getUTCDate() - 30);
    const active = RecordStatus.ACTIVE;
    const [
      students,
      activeStudents,
      recentStudents,
      teachers,
      activeTeachers,
      groups,
      activeGroups,
      runningClasses,
      branches,
      activeBranches,
      activeRooms,
      pendingRequests,
      todaySessions,
      attention,
    ] = await this.prisma.$transaction([
      this.prisma.student.count(),
      this.prisma.student.count({ where: { status: active } }),
      this.prisma.student.count({
        where: { registrationDate: { gte: since } },
      }),
      this.prisma.teacher.count(),
      this.prisma.teacher.count({ where: { status: ActivationStatus.ACTIVE } }),
      this.prisma.group.count(),
      this.prisma.group.count({ where: { status: active } }),
      this.prisma.groupClass.count({
        where: { status: active, group: { status: active } },
      }),
      this.prisma.branch.count(),
      this.prisma.branch.count({ where: { status: ActivationStatus.ACTIVE } }),
      this.prisma.room.count({
        where: {
          status: ActivationStatus.ACTIVE,
          branch: { status: ActivationStatus.ACTIVE },
        },
      }),
      this.prisma.registrationRequest.count({
        where: { status: RegistrationRequestStatus.PENDING },
      }),
      this.prisma.session.count({
        where: {
          date: toDbDate(today),
          status: { not: SessionStatus.CANCELLED },
        },
      }),
      this.prisma.session.count({ where: needsAttentionWhere(today) }),
    ]);
    return {
      today,
      students: {
        total: students,
        active: activeStudents,
        registeredLast30Days: recentStudents,
      },
      teachers: { total: teachers, active: activeTeachers },
      groups: { total: groups, active: activeGroups, runningClasses },
      branches: { total: branches, active: activeBranches, activeRooms },
      registrationRequests: { pending: pendingRequests },
      sessions: { today: todaySessions, needsAttention: attention },
    };
  }
}
