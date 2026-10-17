import { ConflictException, Injectable } from '@nestjs/common';

import { fromDbDate, toDbDate, toLocalDateTime } from '../common/dates.js';
import {
  badRequest,
  conflict,
  isUniqueViolation,
  notFound,
} from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformTimezone } from '../common/platform-clock.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  SessionStatus,
  WorkStatus,
  WorkType,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { expectedOnDate } from '../scheduling/roster.sql.js';
import { fromDbTime, toDbTime } from '../scheduling/time.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';
import type {
  AddWorkItemsDto,
  CreateWorkProgramDto,
  EligibleSessionDto,
  EligibleSessionsQueryDto,
  EvaluateWorkItemDto,
  EvaluateWorkProgramDto,
  NewWorkItemDto,
  NextRecitationDto,
  ScheduleWorkItemDto,
  StudentWorkProgramDto,
  StudentWorkProgramListDto,
  StudentWorkProgramQueryDto,
  UpdateWorkProgramDto,
  WorkItemEditDto,
  WorkProgramDto,
  WorkProgramListDto,
  WorkProgramListQueryDto,
  WorkSessionDto,
} from './work-followup.dto.js';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

/** Who acts: an admin (everything) or a teacher (sessions of their team snapshot). */
export type WorkActor = { kind: 'admin' | 'teacher'; userId: string };

/** Results that may be continued in a later session («نقل إلى الحصة القادمة»). */
export const TRANSFERABLE: WorkStatus[] = [
  WorkStatus.NOT_COMPLETED,
  WorkStatus.PARTIAL,
  WorkStatus.POSTPONED,
  WorkStatus.CANCELLED,
];

const ORDINALS = [
  'الأولى',
  'الثانية',
  'الثالثة',
  'الرابعة',
  'الخامسة',
  'السادسة',
  'السابعة',
  'الثامنة',
  'التاسعة',
  'العاشرة',
];
export const recitationOrdinal = (n: number) => ORDINALS[n - 1] ?? `رقم ${n}`;

/** «العرضة الثانية من سورة التوبة» → «العرضة الثالثة من سورة التوبة» (a leading «إكمال» is dropped). */
export function nextRecitationDescription(description: string, number: number) {
  const base = description.replace(/^إكمال\s+/, '');
  const pattern = new RegExp(`العرضة\\s+(${ORDINALS.join('|')}|رقم\\s+\\d+)`);
  return pattern.test(base)
    ? base.replace(pattern, `العرضة ${recitationOrdinal(number)}`)
    : `العرضة ${recitationOrdinal(number)} — ${base}`;
}

const personName = {
  select: { person: { select: { firstName: true, lastName: true } } },
} as const;
const linkSelect = {
  id: true,
  program: {
    select: { id: true, session: { select: { id: true, date: true } } },
  },
} as const;

const programInclude = {
  student: {
    select: {
      id: true,
      person: { select: { firstName: true, lastName: true, photoUrl: true } },
    },
  },
  session: {
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      groupClassId: true,
      groupClass: { select: { group: { select: { name: true } } } },
      room: { select: { branch: { select: { name: true } } } },
    },
  },
  createdBy: personName,
  updatedBy: personName,
  items: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: {
      evaluatedBy: personName,
      carriedFrom: { select: linkSelect },
      continuedFrom: { select: { ...linkSelect, recitationNumber: true } },
      carriedTo: { select: linkSelect },
      continuedBy: { select: linkSelect },
    },
  },
} satisfies Prisma.WorkProgramInclude;

type ProgramRow = Prisma.WorkProgramGetPayload<{
  include: typeof programInclude;
}>;
type SessionRow = ProgramRow['session'];

const fullName = (
  u?: { person: { firstName: string; lastName: string } } | null,
) => (u ? `${u.person.firstName} ${u.person.lastName}` : null);

const link = (i: {
  id: string;
  program: { id: string; session: { id: string; date: Date } };
}) => ({
  itemId: i.id,
  programId: i.program.id,
  sessionId: i.program.session.id,
  sessionDate: fromDbDate(i.program.session.date),
});

function toSession(s: SessionRow): WorkSessionDto {
  return {
    id: s.id,
    date: fromDbDate(s.date),
    startTime: fromDbTime(s.startTime),
    endTime: fromDbTime(s.endTime),
    status: s.status,
    groupClassId: s.groupClassId,
    groupName: s.groupClass.group.name,
    branchName: s.room.branch.name,
  };
}

/** The approved rule: only COMPLETED is done; CANCELLED is left out of the active total. */
export function progressOf(statuses: WorkStatus[]) {
  const count = (test: (s: WorkStatus) => boolean) =>
    statuses.filter(test).length;
  const total = statuses.length;
  const cancelled = count((s) => s === WorkStatus.CANCELLED);
  const active = total - cancelled;
  const completed = count((s) => s === WorkStatus.COMPLETED);
  return {
    total,
    active,
    completed,
    pending: count((s) => s === WorkStatus.NOT_EVALUATED),
    unfinished: count(
      (s) =>
        s === WorkStatus.NOT_COMPLETED ||
        s === WorkStatus.PARTIAL ||
        s === WorkStatus.POSTPONED,
    ),
    cancelled,
    rate: active > 0 ? Math.round((completed / active) * 1000) / 10 : null,
  };
}

function toDto(p: ProgramRow): WorkProgramDto {
  return {
    id: p.id,
    version: p.version,
    student: {
      id: p.student.id,
      firstName: p.student.person.firstName,
      lastName: p.student.person.lastName,
      photoUrl: p.student.person.photoUrl,
    },
    session: toSession(p.session),
    generalNotes: p.generalNotes,
    lastEditedBy: fullName(p.updatedBy) ?? fullName(p.createdBy),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    progress: progressOf(p.items.map((i) => i.status)),
    items: p.items.map((i) => ({
      id: i.id,
      version: i.version,
      position: i.position,
      type: i.type,
      description: i.description,
      status: i.status,
      recitationNumber: i.recitationNumber,
      evaluationComment: i.evaluationComment,
      evaluatedAt: i.evaluatedAt,
      evaluatedBy: fullName(i.evaluatedBy),
      carriedFrom:
        i.carriedFrom && i.carriedFromStatus
          ? { ...link(i.carriedFrom), status: i.carriedFromStatus }
          : null,
      continuedFrom: i.continuedFrom
        ? {
            ...link(i.continuedFrom),
            recitationNumber: i.continuedFrom.recitationNumber,
          }
        : null,
      carriedTo: i.carriedTo.map(link),
      continuedBy: i.continuedBy.map(link),
    })),
  };
}

/** What a student may see of their own program (read-only, no internal metadata). */
const studentInclude = {
  session: {
    select: {
      ...programInclude.session.select,
      teachers: {
        where: { role: 'SUPERVISOR' },
        select: {
          teacher: {
            select: { person: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  },
  createdBy: {
    select: {
      person: {
        select: {
          firstName: true,
          lastName: true,
          teacher: { select: { id: true } },
        },
      },
    },
  },
  items: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      type: true,
      description: true,
      status: true,
      recitationNumber: true,
      evaluationComment: true,
      carriedFromStatus: true,
      carriedFrom: {
        select: {
          program: { select: { session: { select: { date: true } } } },
        },
      },
    },
  },
} satisfies Prisma.WorkProgramInclude;

type StudentProgramRow = Prisma.WorkProgramGetPayload<{
  include: typeof studentInclude;
}>;

function toStudentDto(p: StudentProgramRow): StudentWorkProgramDto {
  const supervisor = p.session.teachers[0]?.teacher.person;
  const creator = p.createdBy?.person;
  return {
    id: p.id,
    session: toSession(p.session),
    // The teacher who planned it; an admin-planned program shows the session supervisor
    teacherName: creator?.teacher
      ? `${creator.firstName} ${creator.lastName}`
      : supervisor
        ? `${supervisor.firstName} ${supervisor.lastName}`
        : null,
    progress: progressOf(p.items.map((i) => i.status)),
    items: p.items.map((i) => ({
      id: i.id,
      type: i.type,
      description: i.description,
      status: i.status,
      recitationNumber: i.recitationNumber,
      // A comment is shown once the item has been evaluated
      evaluationComment:
        i.status === WorkStatus.NOT_EVALUATED ? null : i.evaluationComment,
      carriedFrom:
        i.carriedFrom && i.carriedFromStatus
          ? {
              sessionDate: fromDbDate(i.carriedFrom.program.session.date),
              status: i.carriedFromStatus,
            }
          : null,
    })),
  };
}

const programNotFound = () =>
  notFound('WORK_PROGRAM_NOT_FOUND', 'برنامج العمل غير موجود');
const itemNotFound = () => notFound('WORK_ITEM_NOT_FOUND', 'العمل غير موجود');
const itemChanged = (ids: string[]) =>
  new ConflictException({
    code: 'WORK_ITEM_CHANGED',
    message:
      'عدّل مستخدم آخر هذا العمل في الأثناء: أعد تحميل الصفحة لرؤية آخر القيم ثم أعد المحاولة',
    conflicts: ids,
  });
const programChanged = () =>
  new ConflictException({
    code: 'WORK_PROGRAM_CHANGED',
    message:
      'عدّل مستخدم آخر هذا البرنامج في الأثناء: أعد تحميل الصفحة لرؤية آخر القيم ثم أعد المحاولة',
  });

/**
 * «متابعة العمل»: work programs (one per student per dated session) and
 * their items. Every rule is enforced here, never only in the frontend:
 *  - a teacher acts only on sessions of their TEAM SNAPSHOT (who taught /
 *    teaches that session — historical, never today's class team); admins on any;
 *  - a student belongs to a session when enrolled in its class and active
 *    ON its date (the attendance roster rule);
 *  - new work (program, transfer, next recitation) only targets an existing
 *    UPCOMING, scheduled session — never a date, never a cancelled session;
 *  - nothing is ever deleted: a dropped item is evaluated CANCELLED, a
 *    transfer creates a new item and leaves its source untouched;
 *  - duplicates are impossible (unique constraints) and stale writes are
 *    refused (version checks) instead of overwriting newer values.
 */
@Injectable()
export class WorkFollowupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TeacherAccessService,
    private readonly pageSizes: PageSizeService,
  ) {}

  // ───────────────────────── reads ─────────────────────────

  async list(
    actor: WorkActor,
    query: WorkProgramListQueryDto,
  ): Promise<WorkProgramListDto> {
    const teacherId = await this.teacherScope(actor);
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const { today, now } = await this.clock(this.prisma);
    const upcoming: Prisma.SessionWhereInput = {
      OR: [
        { date: { gt: toDbDate(today) } },
        { date: toDbDate(today), endTime: { gt: toDbTime(now) } },
      ],
    };
    const past: Prisma.SessionWhereInput = { NOT: upcoming };
    const unfinished = [
      WorkStatus.NOT_COMPLETED,
      WorkStatus.PARTIAL,
      WorkStatus.POSTPONED,
    ];
    const where: Prisma.WorkProgramWhereInput = {
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      session: {
        ...(teacherId ? { teachers: { some: { teacherId } } } : {}),
        ...(query.groupClassId ? { groupClassId: query.groupClassId } : {}),
        ...(query.period === 'upcoming' ? upcoming : {}),
        ...(query.period === 'past' ? past : {}),
      },
      ...(query.q
        ? {
            student: {
              person: {
                OR: [
                  { firstName: { contains: query.q, mode: 'insensitive' } },
                  { lastName: { contains: query.q, mode: 'insensitive' } },
                ],
              },
            },
          }
        : {}),
      ...(query.state === 'pending'
        ? { items: { some: { status: WorkStatus.NOT_EVALUATED } } }
        : query.state === 'unfinished'
          ? { items: { some: { status: { in: unfinished } } } }
          : query.state === 'cancelled'
            ? { items: { some: { status: WorkStatus.CANCELLED } } }
            : query.state === 'done'
              ? {
                  AND: [
                    { items: { some: { status: WorkStatus.COMPLETED } } },
                    {
                      items: {
                        none: {
                          status: {
                            in: [WorkStatus.NOT_EVALUATED, ...unfinished],
                          },
                        },
                      },
                    },
                  ],
                }
              : {}),
    };
    // Upcoming: soonest first; past and "all": most recent first
    const direction = query.period === 'upcoming' ? 'asc' : 'desc';
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.workProgram.count({ where }),
      this.prisma.workProgram.findMany({
        where,
        include: programInclude,
        orderBy: [
          { session: { date: direction } },
          { session: { startTime: direction } },
          { student: { person: { lastName: 'asc' } } },
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

  async get(actor: WorkActor, id: string): Promise<WorkProgramDto> {
    const program = await this.prisma.workProgram.findUnique({
      where: { id },
      select: { sessionId: true },
    });
    if (!program) throw programNotFound();
    await this.assertSession(this.prisma, actor, program.sessionId);
    return this.build(this.prisma, id);
  }

  /** Sessions that have programs in the caller's scope (the session filter). */
  async sessionOptions(actor: WorkActor): Promise<WorkSessionDto[]> {
    const teacherId = await this.teacherScope(actor);
    const sessions = await this.prisma.session.findMany({
      where: {
        workPrograms: { some: {} },
        ...(teacherId ? { teachers: { some: { teacherId } } } : {}),
      },
      select: programInclude.session.select,
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      take: 200,
    });
    return sessions.map(toSession);
  }

  /**
   * Existing UPCOMING scheduled sessions the student is expected in (enrolled
   * and active on the date) — and, for a teacher, of their team; optionally
   * only those later than a source session. Never a free date.
   */
  async eligibleSessions(
    actor: WorkActor,
    query: EligibleSessionsQueryDto,
  ): Promise<EligibleSessionDto[]> {
    const teacherId = await this.teacherScope(actor);
    const student = await this.prisma.student.findUnique({
      where: { id: query.studentId },
      select: { id: true },
    });
    if (!student) throw notFound('STUDENT_NOT_FOUND', 'الطالب غير موجود');
    const after = query.afterSessionId
      ? await this.prisma.session.findUnique({
          where: { id: query.afterSessionId },
          select: { date: true, startTime: true },
        })
      : null;
    if (query.afterSessionId && !after)
      throw notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
    const ids = await this.eligibleSessionIds(this.prisma, {
      studentId: query.studentId,
      teacherId,
      after,
    });
    const [sessions, programs] = await Promise.all([
      this.prisma.session.findMany({
        where: { id: { in: ids } },
        select: programInclude.session.select,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.workProgram.findMany({
        where: { studentId: query.studentId, sessionId: { in: ids } },
        select: { id: true, sessionId: true },
      }),
    ]);
    const programBySession = new Map(programs.map((p) => [p.sessionId, p.id]));
    return sessions.map((s) =>
      Object.assign(toSession(s), {
        programId: programBySession.get(s.id) ?? null,
      }),
    );
  }

  // ───────────────────────── student (read-only) ─────────────────────────

  /** The student's OWN programs only (the id comes from their account, never the client). */
  async listForStudent(
    studentId: string,
    query: StudentWorkProgramQueryDto,
  ): Promise<StudentWorkProgramListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const { today, now } = await this.clock(this.prisma);
    const upcoming: Prisma.SessionWhereInput = {
      OR: [
        { date: { gt: toDbDate(today) } },
        { date: toDbDate(today), endTime: { gt: toDbTime(now) } },
      ],
    };
    const where: Prisma.WorkProgramWhereInput = {
      studentId,
      ...(query.period === 'upcoming' ? { session: upcoming } : {}),
      ...(query.period === 'past' ? { session: { NOT: upcoming } } : {}),
    };
    // Upcoming: soonest first; history: most recent first
    const direction = query.period === 'upcoming' ? 'asc' : 'desc';
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.workProgram.count({ where }),
      this.prisma.workProgram.findMany({
        where,
        include: studentInclude,
        orderBy: [
          { session: { date: direction } },
          { session: { startTime: direction } },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toStudentDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  /** One of the student's own programs — another student's is "not found". */
  async getForStudent(
    studentId: string,
    id: string,
  ): Promise<StudentWorkProgramDto> {
    const program = await this.prisma.workProgram.findFirst({
      where: { id, studentId },
      include: studentInclude,
    });
    if (!program) throw programNotFound();
    return toStudentDto(program);
  }

  // ───────────────────────── writes ─────────────────────────

  async create(
    actor: WorkActor,
    dto: CreateWorkProgramDto,
  ): Promise<WorkProgramDto> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.findUnique({
          where: { id: dto.studentId },
          select: { id: true },
        });
        if (!student) throw notFound('STUDENT_NOT_FOUND', 'الطالب غير موجود');
        await this.assertTarget(tx, actor, dto.studentId, dto.sessionId);
        const existing = await tx.workProgram.findUnique({
          where: {
            studentId_sessionId: {
              studentId: dto.studentId,
              sessionId: dto.sessionId,
            },
          },
          select: { id: true },
        });
        if (existing) throw programExists(existing.id);
        const program = await tx.workProgram.create({
          data: {
            studentId: dto.studentId,
            sessionId: dto.sessionId,
            generalNotes: dto.generalNotes ?? null,
            createdByUserId: actor.userId,
            updatedByUserId: actor.userId,
          },
          select: { id: true },
        });
        await tx.workItem.createMany({
          data: dto.items.map((item, position) => ({
            ...newItem(item, actor.userId),
            workProgramId: program.id,
            position,
          })),
        });
        return program.id;
      });
      return await this.build(this.prisma, id);
    } catch (error) {
      // Two teachers at once: the unique (student, session) decides
      if (isUniqueViolation(error, 'studentId')) {
        const winner = await this.prisma.workProgram.findUnique({
          where: {
            studentId_sessionId: {
              studentId: dto.studentId,
              sessionId: dto.sessionId,
            },
          },
          select: { id: true },
        });
        throw programExists(winner?.id ?? null);
      }
      throw error;
    }
  }

  /** «تعديل البرنامج»: notes, saved items' planning, new items — atomically; nothing deleted. */
  async update(
    actor: WorkActor,
    id: string,
    dto: UpdateWorkProgramDto,
  ): Promise<WorkProgramDto> {
    await this.prisma.$transaction(async (tx) => {
      const program = await this.lockProgram(tx, actor, id);
      if (dto.generalNotes !== undefined) {
        if (dto.version === undefined)
          throw badRequest(
            'WORK_PROGRAM_VERSION_REQUIRED',
            'إصدار البرنامج مطلوب لتعديل الملاحظات',
          );
        if (dto.version !== program.version) throw programChanged();
      }
      const stale: string[] = [];
      for (const edit of dto.items ?? []) {
        const changed = await this.editItem(
          tx,
          actor,
          program.id,
          edit.id,
          edit,
        );
        if (changed === 'stale') stale.push(edit.id);
      }
      if (stale.length) throw itemChanged(stale);
      if (dto.newItems?.length) {
        if (program.session.status === SessionStatus.CANCELLED)
          throw sessionCancelled();
        await this.appendItems(tx, actor, program.id, dto.newItems);
      }
      await this.touch(tx, actor, program.id, dto.generalNotes);
    });
    return this.build(this.prisma, id);
  }

  async addItems(
    actor: WorkActor,
    id: string,
    dto: AddWorkItemsDto,
  ): Promise<WorkProgramDto> {
    return this.update(actor, id, { newItems: dto.items });
  }

  async updateItem(
    actor: WorkActor,
    itemId: string,
    dto: WorkItemEditDto,
  ): Promise<WorkProgramDto> {
    const programId = await this.programOfItem(itemId);
    return this.update(actor, programId, {
      items: [
        {
          id: itemId,
          version: dto.version,
          type: dto.type,
          description: dto.description,
          recitationNumber: dto.recitationNumber,
        },
      ],
    });
  }

  /** «حفظ التقييم»: each listed item gets its own result; others are untouched. */
  async evaluate(
    actor: WorkActor,
    id: string,
    dto: EvaluateWorkProgramDto,
  ): Promise<WorkProgramDto> {
    await this.prisma.$transaction(async (tx) => {
      const program = await this.lockProgram(tx, actor, id);
      if (dto.generalNotes !== undefined) {
        if (dto.version === undefined)
          throw badRequest(
            'WORK_PROGRAM_VERSION_REQUIRED',
            'إصدار البرنامج مطلوب لتعديل الملاحظات',
          );
        if (dto.version !== program.version) throw programChanged();
      }
      const stale: string[] = [];
      for (const line of dto.items) {
        const current = await tx.workItem.findFirst({
          where: { id: line.id, workProgramId: program.id },
          select: { id: true, status: true, evaluationComment: true },
        });
        if (!current) throw itemNotFound();
        const comment =
          line.evaluationComment === undefined
            ? current.evaluationComment
            : line.evaluationComment;
        // Version check in the WHERE: a stale client never overwrites a newer result
        const { count } = await tx.workItem.updateMany({
          where: { id: line.id, version: line.version },
          data: {
            status: line.status,
            evaluationComment: comment,
            evaluatedAt: new Date(),
            evaluatedByUserId: actor.userId,
            updatedByUserId: actor.userId,
            version: { increment: 1 },
          },
        });
        if (count === 0) stale.push(line.id);
      }
      if (stale.length) throw itemChanged(stale);
      await this.touch(tx, actor, program.id, dto.generalNotes);
    });
    return this.build(this.prisma, id);
  }

  async evaluateItem(
    actor: WorkActor,
    itemId: string,
    dto: EvaluateWorkItemDto,
  ): Promise<WorkProgramDto> {
    const programId = await this.programOfItem(itemId);
    return this.evaluate(actor, programId, {
      items: [
        {
          id: itemId,
          version: dto.version,
          status: dto.status,
          evaluationComment: dto.evaluationComment,
        },
      ],
    });
  }

  /**
   * «نقل إلى الحصة القادمة»: the SAME task (type, description, number) into a
   * later upcoming session of the same student, unevaluated; the source is
   * untouched and keeps its result. Returns the target program.
   */
  async transfer(
    actor: WorkActor,
    itemId: string,
    dto: ScheduleWorkItemDto,
  ): Promise<WorkProgramDto> {
    return this.schedule(actor, itemId, dto.targetSessionId, (source) => {
      if (!TRANSFERABLE.includes(source.status))
        throw conflict(
          'WORK_ITEM_NOT_TRANSFERABLE',
          'لا يُنقل إلا عمل غير منجز أو جزئي أو مؤجل أو ملغى',
        );
      return {
        type: source.type,
        description: source.description,
        recitationNumber: source.recitationNumber,
        carriedFromItemId: source.id,
        carriedFromStatus: source.status,
      };
    });
  }

  /** «إضافة العرضة التالية»: the next numbered recitation (number + 1) into a later upcoming session. */
  async nextRecitation(
    actor: WorkActor,
    itemId: string,
    dto: NextRecitationDto,
  ): Promise<WorkProgramDto> {
    return this.schedule(actor, itemId, dto.targetSessionId, (source) => {
      if (source.type !== WorkType.RECITATION)
        throw badRequest(
          'WORK_ITEM_NOT_RECITATION',
          'العرضة التالية لا تُضاف إلا لعمل من نوع عرضة',
        );
      if (!source.recitationNumber)
        throw badRequest(
          'WORK_RECITATION_NUMBER_REQUIRED',
          'حدّد رقم هذه العرضة أولًا لإضافة العرضة التالية',
        );
      const number = source.recitationNumber + 1;
      return {
        type: WorkType.RECITATION,
        description:
          dto.description ??
          nextRecitationDescription(source.description, number),
        recitationNumber: number,
        continuedFromItemId: source.id,
      };
    });
  }

  // ───────────────────────── internals ─────────────────────────

  private async schedule(
    actor: WorkActor,
    itemId: string,
    targetSessionId: string,
    plan: (source: {
      id: string;
      type: WorkType;
      description: string;
      status: WorkStatus;
      recitationNumber: number | null;
    }) => Omit<Prisma.WorkItemCreateManyInput, 'workProgramId' | 'position'>,
  ): Promise<WorkProgramDto> {
    try {
      const targetProgramId = await this.prisma.$transaction(async (tx) => {
        const source = await tx.workItem.findUnique({
          where: { id: itemId },
          select: {
            id: true,
            type: true,
            description: true,
            status: true,
            recitationNumber: true,
            program: {
              select: {
                studentId: true,
                session: { select: { id: true, date: true, startTime: true } },
              },
            },
          },
        });
        if (!source) throw itemNotFound();
        await this.assertSession(tx, actor, source.program.session.id);
        const fields = plan(source);
        const target = await this.assertTarget(
          tx,
          actor,
          source.program.studentId,
          targetSessionId,
        );
        const sourceStart = `${fromDbDate(source.program.session.date)}T${fromDbTime(source.program.session.startTime)}`;
        const targetStart = `${fromDbDate(target.date)}T${fromDbTime(target.startTime)}`;
        if (targetStart <= sourceStart)
          throw badRequest(
            'WORK_TARGET_SESSION_NOT_LATER',
            'اختر حصة لاحقة للحصة الأصلية',
          );
        // Find or create the student's program of the target session (race-safe)
        await tx.workProgram.createMany({
          data: [
            {
              studentId: source.program.studentId,
              sessionId: targetSessionId,
              createdByUserId: actor.userId,
              updatedByUserId: actor.userId,
            },
          ],
          skipDuplicates: true,
        });
        const program = await tx.workProgram.findUniqueOrThrow({
          where: {
            studentId_sessionId: {
              studentId: source.program.studentId,
              sessionId: targetSessionId,
            },
          },
          select: { id: true },
        });
        const duplicate = await tx.workItem.findFirst({
          where: {
            workProgramId: program.id,
            ...(fields.carriedFromItemId
              ? { carriedFromItemId: source.id }
              : { continuedFromItemId: source.id }),
          },
          select: { id: true },
        });
        if (duplicate)
          throw alreadyScheduled(Boolean(fields.carriedFromItemId));
        await tx.workItem.create({
          data: {
            ...fields,
            status: WorkStatus.NOT_EVALUATED,
            workProgramId: program.id,
            position: await this.nextPosition(tx, program.id),
            createdByUserId: actor.userId,
          },
        });
        await this.touch(tx, actor, program.id);
        return program.id;
      });
      return await this.build(this.prisma, targetProgramId);
    } catch (error) {
      // Two identical requests at once: the unique (source, target program) decides
      if (isUniqueViolation(error, 'carriedFromItemId'))
        throw alreadyScheduled(true);
      if (isUniqueViolation(error, 'continuedFromItemId'))
        throw alreadyScheduled(false);
      throw error;
    }
  }

  /** null for an admin; the teacher id otherwise (403 without an active teacher profile). */
  private async teacherScope(actor: WorkActor) {
    return actor.kind === 'teacher'
      ? this.access.teacherIdOf(actor.userId)
      : null;
  }

  private async assertSession(db: Db, actor: WorkActor, sessionId: string) {
    if (actor.kind === 'teacher')
      await this.access.assertSessionAccess(actor.userId, sessionId, db);
  }

  /**
   * A session that may RECEIVE new work: exists, the caller may act on it,
   * scheduled (not cancelled / completed), upcoming, and the student is
   * expected in it (enrolled and active on its date).
   */
  private async assertTarget(
    tx: Tx,
    actor: WorkActor,
    studentId: string,
    sessionId: string,
  ) {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        date: true,
        startTime: true,
        status: true,
        groupClassId: true,
      },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
    await this.assertSession(tx, actor, sessionId);
    if (session.status === SessionStatus.CANCELLED) throw sessionCancelled();
    const { today, now } = await this.clock(tx);
    const date = fromDbDate(session.date);
    if (
      session.status !== SessionStatus.SCHEDULED ||
      date < today ||
      (date === today && fromDbTime(session.startTime) <= now)
    )
      throw conflict(
        'WORK_SESSION_NOT_UPCOMING',
        'لا يُبرمج عمل جديد إلا في حصة قادمة لم تبدأ بعد',
      );
    const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM student_enrollments e
        WHERE e."studentId" = ${studentId}::uuid
          AND e."groupClassId" = ${session.groupClassId}::uuid
          AND ${expectedOnDate('e', Prisma.sql`${date}::date`)}
      ) AS ok`;
    if (!row?.ok)
      throw badRequest(
        'WORK_STUDENT_NOT_IN_SESSION',
        'الطالب ليس من طلبة قسم هذه الحصة في تاريخها',
      );
    return session;
  }

  private async eligibleSessionIds(
    db: Db,
    input: {
      studentId: string;
      teacherId: string | null;
      after: { date: Date; startTime: Date } | null;
    },
  ) {
    const { today, now } = await this.clock(db);
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT s.id FROM sessions s
      WHERE s.status = 'SCHEDULED'
        AND (s.date > ${today}::date OR (s.date = ${today}::date AND s."startTime" > ${now}::time))
        AND EXISTS (
          SELECT 1 FROM student_enrollments e
          WHERE e."studentId" = ${input.studentId}::uuid
            AND e."groupClassId" = s."groupClassId"
            AND ${expectedOnDate('e', Prisma.sql`s.date`)}
        )
        ${
          input.teacherId
            ? Prisma.sql`AND EXISTS (SELECT 1 FROM session_teachers st WHERE st."sessionId" = s.id AND st."teacherId" = ${input.teacherId}::uuid)`
            : Prisma.empty
        }
        ${
          input.after
            ? Prisma.sql`AND (s.date, s."startTime") > (${fromDbDate(input.after.date)}::date, ${fromDbTime(input.after.startTime)}::time)`
            : Prisma.empty
        }
      ORDER BY s.date, s."startTime"
      LIMIT 60`;
    return rows.map((r) => r.id);
  }

  /** The program row locked for this transaction, after the access check. */
  private async lockProgram(tx: Tx, actor: WorkActor, id: string) {
    await tx.$queryRaw`SELECT id FROM work_programs WHERE id = ${id}::uuid FOR UPDATE`;
    const program = await tx.workProgram.findUnique({
      where: { id },
      select: {
        id: true,
        version: true,
        sessionId: true,
        session: { select: { status: true } },
      },
    });
    if (!program) throw programNotFound();
    await this.assertSession(tx, actor, program.sessionId);
    return program;
  }

  /** Planning changes of a saved item (never its result); 'stale' on a version mismatch. */
  private async editItem(
    tx: Tx,
    actor: WorkActor,
    programId: string,
    itemId: string,
    edit: WorkItemEditDto,
  ): Promise<'ok' | 'stale'> {
    const current = await tx.workItem.findFirst({
      where: { id: itemId, workProgramId: programId },
      select: {
        type: true,
        description: true,
        recitationNumber: true,
        continuedFromItemId: true,
      },
    });
    if (!current) throw itemNotFound();
    const type = edit.type ?? current.type;
    if (current.continuedFromItemId && type !== WorkType.RECITATION)
      throw badRequest(
        'WORK_ITEM_TYPE_LOCKED',
        'هذه عرضة تالية لعرضة سابقة: لا يمكن تغيير نوعها',
      );
    const recitationNumber =
      type !== WorkType.RECITATION
        ? null
        : edit.recitationNumber === undefined
          ? current.recitationNumber
          : edit.recitationNumber;
    if (current.continuedFromItemId && !recitationNumber)
      throw badRequest(
        'WORK_RECITATION_NUMBER_REQUIRED',
        'رقم العرضة مطلوب لعرضة تالية',
      );
    const description = edit.description ?? current.description;
    if (
      type === current.type &&
      description === current.description &&
      recitationNumber === current.recitationNumber
    )
      return 'ok';
    const { count } = await tx.workItem.updateMany({
      where: { id: itemId, version: edit.version },
      data: {
        type,
        description,
        recitationNumber,
        updatedByUserId: actor.userId,
        version: { increment: 1 },
      },
    });
    return count === 0 ? 'stale' : 'ok';
  }

  private async appendItems(
    tx: Tx,
    actor: WorkActor,
    programId: string,
    items: NewWorkItemDto[],
  ) {
    const start = await this.nextPosition(tx, programId);
    await tx.workItem.createMany({
      data: items.map((item, i) => ({
        ...newItem(item, actor.userId),
        workProgramId: programId,
        position: start + i,
      })),
    });
  }

  private async nextPosition(tx: Tx, programId: string) {
    const last = await tx.workItem.aggregate({
      where: { workProgramId: programId },
      _max: { position: true },
    });
    return (last._max.position ?? -1) + 1;
  }

  /** Last editor (and the notes, when sent: version + 1). */
  private async touch(
    tx: Tx,
    actor: WorkActor,
    programId: string,
    generalNotes?: string | null,
  ) {
    await tx.workProgram.update({
      where: { id: programId },
      data: {
        updatedByUserId: actor.userId,
        ...(generalNotes !== undefined
          ? { generalNotes, version: { increment: 1 } }
          : {}),
      },
    });
  }

  private async programOfItem(itemId: string) {
    const item = await this.prisma.workItem.findUnique({
      where: { id: itemId },
      select: { workProgramId: true },
    });
    if (!item) throw itemNotFound();
    return item.workProgramId;
  }

  /** Today's date and the "HH:mm" time in the platform timezone (Africa/Tunis). */
  private async clock(db: Db) {
    const local = toLocalDateTime(new Date(), await platformTimezone(db));
    return { today: local.slice(0, 10), now: local.slice(11, 16) };
  }

  private async build(db: Db, id: string) {
    return toDto(
      await db.workProgram.findUniqueOrThrow({
        where: { id },
        include: programInclude,
      }),
    );
  }
}

/** A new item: unevaluated; a number only for a recitation. */
function newItem(item: NewWorkItemDto, userId: string) {
  return {
    type: item.type,
    description: item.description,
    status: WorkStatus.NOT_EVALUATED,
    recitationNumber:
      item.type === WorkType.RECITATION
        ? (item.recitationNumber ?? null)
        : null,
    createdByUserId: userId,
    updatedByUserId: userId,
  };
}

const programExists = (programId: string | null) =>
  new ConflictException({
    code: 'WORK_PROGRAM_EXISTS',
    message: 'يوجد برنامج عمل لهذا الطالب في هذه الحصة: افتحه لتعديله',
    programId,
  });

const sessionCancelled = () =>
  conflict(
    'WORK_SESSION_CANCELLED',
    'هذه الحصة ملغاة: لا يُضاف إليها عمل جديد (يبقى عملها السابق محفوظًا)',
  );

const alreadyScheduled = (carry: boolean) =>
  conflict(
    carry ? 'WORK_ITEM_ALREADY_TRANSFERRED' : 'WORK_RECITATION_ALREADY_PLANNED',
    carry
      ? 'سبق نقل هذا العمل إلى هذه الحصة'
      : 'العرضة التالية لهذا العمل مبرمجة مسبقًا في هذه الحصة',
  );
