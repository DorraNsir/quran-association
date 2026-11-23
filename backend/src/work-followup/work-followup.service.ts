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
import { notStartedAt, platformTimezone } from '../common/platform-clock.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  SessionStatus,
  WorkAssignmentKind,
  WorkPerformance,
  WorkStatus,
  WorkType,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ACTIVE_EDITION_ID,
  describeAssignment,
  edition,
  isGeneratedDescription,
  NO_ASSIGNMENT,
  presentWorkload,
  resolveAssignment,
  sameAssignment,
  type AssignmentInput,
  type StoredAssignment,
} from '../quran-reference/quran-assignment.js';
import {
  sessionClassIdsSql,
  sessionOfClass,
} from '../scheduling/participants.js';
import { expectedOnDate } from '../scheduling/roster.sql.js';
import { surahName } from '../memorization/surahs.js';
import { orderByWorkload, type OrderedProgram } from './workload-order.js';
import {
  isAttempt,
  lockRecitations,
  lockSessionWork,
  numberSurah,
  recitationContradiction,
  sessionStart,
  startAr,
  type HistoryRow,
  recitationEntry,
  recitationsOf,
  trackedSurah,
} from './recitations.js';
import { fromDbTime, toDbTime } from '../scheduling/time.js';
import {
  managesClassInSession,
  TeacherAccessService,
} from '../teaching/teacher-access.service.js';
import type {
  AddWorkItemsDto,
  CreateWorkProgramDto,
  EligibleSessionDto,
  EligibleSessionsQueryDto,
  EvaluateWorkItemDto,
  EvaluateWorkProgramDto,
  EvaluationBlock,
  NewWorkItemDto,
  NextRecitationDto,
  RecitationAttemptDto,
  RecitationHistoryDto,
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

/**
 * May this item be carried into a later session? An evaluated unfinished
 * result — or, from a CANCELLED session (never evaluable), an item still
 * unevaluated. Normal sessions keep the TRANSFERABLE rule.
 */
export const isTransferable = (
  status: WorkStatus,
  sessionStatus: SessionStatus,
) =>
  TRANSFERABLE.includes(status) ||
  (status === WorkStatus.NOT_EVALUATED &&
    sessionStatus === SessionStatus.CANCELLED);

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

const ORDINAL_PATTERN = () =>
  new RegExp(`العرضة\\s+(${ORDINALS.join('|')}|رقم\\s+\\d+)`);
/** Does a description name a recitation number («العرضة الثانية …»)? */
export const hasRecitationOrdinal = (description: string) =>
  ORDINAL_PATTERN().test(description);

/** «العرضة الثانية من سورة التوبة» → «العرضة الثالثة من سورة التوبة» (a leading «إكمال» is dropped). */
export function nextRecitationDescription(description: string, number: number) {
  const base = description.replace(/^إكمال\s+/, '');
  const pattern = new RegExp(`العرضة\\s+(${ORDINALS.join('|')}|رقم\\s+\\d+)`);
  return pattern.test(base)
    ? base.replace(pattern, `العرضة ${recitationOrdinal(number)}`)
    : `العرضة ${recitationOrdinal(number)} — ${base}`;
}

/** A planning change (creation, edit, transfer, next recitation) contradicting a performed recitation. */
const PLANNING_REFUSAL = {
  code: 'WORK_RECITATION_ORDER',
  lead: 'لا يمكن برمجة هذه العرضة هنا',
};

const personName = {
  select: { person: { select: { firstName: true, lastName: true } } },
} as const;
const linkSelect = {
  id: true,
  program: {
    select: { id: true, session: { select: { id: true, date: true } } },
  },
} as const;

/** Structured Quranic assignment columns of a work item. */
const ASSIGNMENT_SELECT = {
  quranAssignmentKind: true,
  quranEditionId: true,
  quranFromSurah: true,
  quranFromAyah: true,
  quranToSurah: true,
  quranToAyah: true,
  quranFromPage: true,
  quranToPage: true,
  quranWorkload: true,
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
  overallEvaluatedBy: personName,
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

type Clock = { today: string; now: string };

/**
 * Evaluating a session's work: only once it has STARTED (its current date and
 * start time — a rescheduled lesson counts from its new time — in the
 * platform timezone), during and after it (a completed session stays open
 * for corrections); never for a cancelled one. The attendance rule, shared by
 * the evaluation endpoints and the `evaluation` flag the clients read.
 */
export function evaluationBlock(
  session: { status: SessionStatus; date: Date; startTime: Date },
  clock: Clock,
): EvaluationBlock | null {
  if (session.status === SessionStatus.CANCELLED) return 'SESSION_CANCELLED';
  if (
    notStartedAt(clock, fromDbDate(session.date), fromDbTime(session.startTime))
  )
    return 'SESSION_NOT_STARTED';
  return null;
}

/** «ترتيب حسب البرنامج»: where a program stands in the advisory order (no rank, no score). */
function workloadOrderOf(o: OrderedProgram<string>) {
  return o.size.kind === 'comparable'
    ? {
        comparable: true as const,
        group: o.group as number,
        pages: o.size.primary,
        examPages: o.size.exam,
        reason: null,
      }
    : {
        comparable: false as const,
        group: null,
        pages: null,
        examPages: null,
        reason: o.size.reason,
      };
}

/** «متابعة العرضات» of an item: its surah, and how many recitations of it the student has done. */
export interface RecitationSummary {
  surah: number;
  /** Recitations of this surah done with a result (منجز / جزئي / غير منجز / ملغى) — all sessions */
  attempts: number;
}

/** The recitation summaries of the structured عرضة items of some programs (one query). */
async function recitationSummaries(
  db: Db,
  ...programs: ProgramRow[]
): Promise<Map<string, RecitationSummary>> {
  const tracked = programs.flatMap((p) =>
    p.items.flatMap((i) => {
      const surah = trackedSurah(i);
      return surah ? [{ itemId: i.id, studentId: p.studentId, surah }] : [];
    }),
  );
  const out = new Map<string, RecitationSummary>();
  if (!tracked.length) return out;
  const rows = await db.workItem.findMany({
    where: recitationsOf(
      [...new Set(tracked.map((t) => t.studentId))],
      [...new Set(tracked.map((t) => t.surah))],
    ),
    select: {
      status: true,
      quranFromSurah: true,
      program: {
        select: { studentId: true, session: { select: { status: true } } },
      },
    },
  });
  const count = new Map<string, number>();
  for (const r of rows)
    if (isAttempt(recitationEntry(r.status, r.program.session.status))) {
      const key = `${r.program.studentId}:${r.quranFromSurah}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  for (const t of tracked)
    out.set(t.itemId, {
      surah: t.surah,
      attempts: count.get(`${t.studentId}:${t.surah}`) ?? 0,
    });
  return out;
}

function toDto(
  p: ProgramRow,
  clock: Clock,
  recitations: Map<string, RecitationSummary>,
): WorkProgramDto {
  const blockedReason = evaluationBlock(p.session, clock);
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
    evaluation: { allowed: blockedReason === null, blockedReason },
    generalNotes: p.generalNotes,
    lastEditedBy: fullName(p.updatedBy) ?? fullName(p.createdBy),
    // «التقييم العام»: the teacher's own judgment (null until given)
    overallEvaluation:
      p.overallEvaluation && p.overallEvaluatedAt
        ? {
            level: p.overallEvaluation,
            evaluatedAt: p.overallEvaluatedAt,
            evaluatedBy: fullName(p.overallEvaluatedBy),
          }
        : null,
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
      assignment: assignmentOf(i),
      workload: presentWorkload(
        (i.quranWorkload as Record<string, unknown> | null) ?? null,
      ),
      recitation: recitations.get(i.id) ?? null,
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
      ...ASSIGNMENT_SELECT,
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
    overallEvaluation:
      p.overallEvaluation && p.overallEvaluatedAt
        ? { level: p.overallEvaluation, evaluatedAt: p.overallEvaluatedAt }
        : null,
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
      // What to work on, structured (the workload stays with the teachers)
      assignment: assignmentOf(i),
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
    // Shared sessions: programs the caller may not see (another class's
    // students for an assistant) or outside the filtered class
    const excluded = await this.excludedInSharedSessions(
      teacherId,
      query.groupClassId,
    );
    const where: Prisma.WorkProgramWhereInput = {
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(excluded.length ? { id: { notIn: excluded } } : {}),
      session: {
        ...(teacherId ? { teachers: { some: { teacherId } } } : {}),
        ...(query.groupClassId
          ? sessionOfClass({ id: query.groupClassId })
          : {}),
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
    const orderBy: Prisma.WorkProgramOrderByWithRelationInput[] = [
      { session: { date: direction } },
      { session: { startTime: direction } },
      { student: { person: { lastName: 'asc' } } },
      { id: 'asc' },
    ];
    const clock = await this.clock(this.prisma);
    if (query.order === 'workload') {
      // «ترتيب حسب البرنامج» (advisory): one session, ordered as a WHOLE before paginating
      if (!query.sessionId)
        throw badRequest(
          'WORK_ORDER_SESSION_REQUIRED',
          'اختر حصة لترتيب طلبتها حسب البرنامج',
        );
      const all = await this.prisma.workProgram.findMany({
        where,
        orderBy,
        select: {
          id: true,
          items: { select: { type: true, quranWorkload: true } },
        },
      });
      const ordered = orderByWorkload(
        all.map((p) => ({ value: p.id, items: p.items })),
        ACTIVE_EDITION_ID,
      );
      const page = ordered.slice(
        (query.page - 1) * pageSize,
        query.page * pageSize,
      );
      const rows = await this.prisma.workProgram.findMany({
        where: { id: { in: page.map((o) => o.value) } },
        include: programInclude,
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const cycles = await recitationSummaries(this.prisma, ...rows);
      return {
        data: page.map((o) => {
          const dto = toDto(byId.get(o.value)!, clock, cycles);
          dto.workloadOrder = workloadOrderOf(o);
          return dto;
        }),
        meta: paginationMeta(query.page, pageSize, all.length),
      };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.workProgram.count({ where }),
      this.prisma.workProgram.findMany({
        where,
        include: programInclude,
        orderBy,
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const cycles = await recitationSummaries(this.prisma, ...rows);
    return {
      data: rows.map((row) => toDto(row, clock, cycles)),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(actor: WorkActor, id: string): Promise<WorkProgramDto> {
    const program = await this.prisma.workProgram.findUnique({
      where: { id },
      select: { sessionId: true, studentId: true },
    });
    if (!program) throw programNotFound();
    await this.assertStudent(
      this.prisma,
      actor,
      program.sessionId,
      program.studentId,
    );
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
    const afterSession = query.afterSessionId
      ? await this.prisma.session.findUnique({
          where: { id: query.afterSessionId },
          select: { date: true, startTime: true },
        })
      : null;
    if (query.afterSessionId && !afterSession)
      throw notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
    let after = afterSession
      ? sessionStart(afterSession.date, afterSession.startTime)
      : null;
    // Transfer / next recitation of an item: later than its session (a postponed عرضة whose
    // continuation is already planned: none — the write checks it again)
    if (query.forItemId) {
      const bounds = await this.scheduleBounds(
        query.forItemId,
        query.studentId,
        query.purpose ?? 'TRANSFER',
      );
      if (bounds.none) return [];
      if (!after || bounds.after > after) after = bounds.after;
    }
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
        await lockSessionWork(tx, [dto.sessionId]);
        await lockRecitations(tx, [dto.studentId]);
        const before = await snapshotRecitations(tx, [dto.studentId]);
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
        const created = await tx.workItem.createManyAndReturn({
          data: dto.items.map((item, position) => ({
            ...newItem(item, actor.userId),
            workProgramId: program.id,
            position,
          })),
          select: { id: true },
        });
        await this.numberRecitations(
          tx,
          dto.studentId,
          created.map((c) => c.id),
        );
        await settleRecitations(tx, [dto.studentId], before, PLANNING_REFUSAL);
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
      const before = await snapshotRecitations(tx, [program.studentId]);
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
          program.studentId,
          edit.id,
          edit,
        );
        if (changed === 'stale') stale.push(edit.id);
      }
      if (stale.length) throw itemChanged(stale);
      if (dto.newItems?.length) {
        if (program.session.status === SessionStatus.CANCELLED)
          throw sessionCancelled();
        await this.appendItems(
          tx,
          actor,
          program.id,
          program.studentId,
          dto.newItems,
        );
      }
      await settleRecitations(
        tx,
        [program.studentId],
        before,
        PLANNING_REFUSAL,
      );
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
          assignment: dto.assignment,
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
      // Access first (403 before anything about the session), then timing
      const program = await this.lockProgram(tx, actor, id);
      const blocked = evaluationBlock(program.session, await this.clock(tx));
      if (blocked) throw evaluationRefused(blocked);
      const before = await snapshotRecitations(tx, [program.studentId]);
      // recitations performed by this evaluation: their number becomes definitive here
      const performed = new Set<string>();
      // The program's own fields (notes, «التقييم العام»): version checked — no lost update
      if (dto.generalNotes !== undefined || dto.overall !== undefined) {
        if (dto.version === undefined)
          throw badRequest(
            'WORK_PROGRAM_VERSION_REQUIRED',
            dto.overall !== undefined
              ? 'إصدار البرنامج مطلوب لحفظ التقييم العام'
              : 'إصدار البرنامج مطلوب لتعديل الملاحظات',
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
        const attempt = (st: WorkStatus) =>
          isAttempt(recitationEntry(st, program.session.status));
        if (!attempt(current.status) && attempt(line.status))
          performed.add(line.id);
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
      // «متابعة العرضات»: a postponement / a correction renumbers what follows — never a
      // recitation already performed
      await settleRecitations(
        tx,
        [program.studentId],
        before,
        { code: 'WORK_RECITATION_ORDER', lead: 'لا يمكن حفظ هذا التقييم' },
        performed,
      );
      // «التقييم العام»: the teacher's own choice, never derived from the items; the same
      // level sent again changes nothing (who and when stay those of the real decision)
      const overall =
        dto.overall !== undefined && dto.overall !== program.overallEvaluation
          ? {
              overallEvaluation: dto.overall,
              overallEvaluatedAt: new Date(),
              overallEvaluatedByUserId: actor.userId,
            }
          : undefined;
      await this.touch(tx, actor, program.id, dto.generalNotes, overall);
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
   * A CANCELLED session's work can never be evaluated: its unevaluated items
   * may be carried as they are (carriedFromStatus NOT_EVALUATED).
   */
  async transfer(
    actor: WorkActor,
    itemId: string,
    dto: ScheduleWorkItemDto,
  ): Promise<WorkProgramDto> {
    return this.schedule(actor, itemId, dto.targetSessionId, (source) => {
      if (!isTransferable(source.status, source.sessionStatus))
        throw conflict(
          'WORK_ITEM_NOT_TRANSFERABLE',
          'لا يُنقل إلا عمل غير منجز أو جزئي أو مؤجل أو ملغى، أو عمل لم يُقيَّم من حصة ملغاة',
        );
      return {
        type: source.type,
        description: source.description,
        recitationNumber: source.recitationNumber,
        // The same task: its structured assignment, edition and workload are copied as they are
        ...copyAssignment(source),
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
        // The same surah, recited again: assignment, edition and workload copied
        ...copyAssignment(source),
        continuedFromItemId: source.id,
      };
    });
  }

  // ───────────────────────── «متابعة العرضات» ─────────────────────────

  /**
   * A student's recitations, by surah: every عرضة of the surah in chronological order with its
   * number and result, how many were done, and the next number. Admin: any student; teacher: a
   * student they currently teach.
   */
  async recitationHistory(
    actor: WorkActor,
    studentId: string,
  ): Promise<RecitationHistoryDto> {
    await this.assertStudentProfile(this.prisma, actor, studentId);
    return this.history(this.prisma, studentId);
  }

  private async assertStudentProfile(
    db: Db,
    actor: WorkActor,
    studentId: string,
  ) {
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw notFound('STUDENT_NOT_FOUND', 'الطالب غير موجود');
    if (actor.kind === 'teacher') {
      const { today } = await this.clock(db);
      await this.access.assertStudentAccess(
        actor.userId,
        studentId,
        { from: today, to: today },
        db,
      );
    }
  }

  private async history(
    db: Db,
    studentId: string,
  ): Promise<RecitationHistoryDto> {
    const items = await db.workItem.findMany({
      where: recitationsOf([studentId]),
      select: {
        id: true,
        status: true,
        createdAt: true,
        recitationNumber: true,
        quranFromSurah: true,
        evaluationComment: true,
        evaluatedAt: true,
        evaluatedBy: personName,
        program: {
          select: {
            id: true,
            session: {
              select: { id: true, date: true, startTime: true, status: true },
            },
          },
        },
      },
    });
    // chronological: the session's date and time, then the order of planning
    items.sort(
      (a, b) =>
        a.program.session.date.getTime() - b.program.session.date.getTime() ||
        a.program.session.startTime.getTime() -
          b.program.session.startTime.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    const surahs = [
      ...new Set(items.map((i) => i.quranFromSurah as number)),
    ].sort((a, b) => a - b);
    return {
      studentId,
      surahs: surahs.map((surah) => {
        const own = items.filter((i) => i.quranFromSurah === surah);
        // the chronological numbers (the same rule as every change: numberSurah)
        const numbering = numberSurah(own.map(historyRow));
        const entries = own.map((i): RecitationAttemptDto => {
          const entry = recitationEntry(i.status, i.program.session.status);
          return {
            itemId: i.id,
            programId: i.program.id,
            sessionId: i.program.session.id,
            sessionDate: fromDbDate(i.program.session.date),
            number: numbering.numbers.get(i.id) ?? i.recitationNumber,
            entry,
            status: i.status,
            evaluationComment: i.evaluationComment,
            evaluatedAt: i.evaluatedAt,
            evaluatedBy: fullName(i.evaluatedBy),
          };
        });
        return {
          surah,
          attempts: entries.filter((e) => isAttempt(e.entry as never)).length,
          nextNumber: numbering.next,
          entries,
        };
      }),
    };
  }

  // ───────────────────────── internals ─────────────────────────

  private async schedule(
    actor: WorkActor,
    itemId: string,
    targetSessionId: string,
    plan: (
      source: {
        id: string;
        type: WorkType;
        description: string;
        status: WorkStatus;
        recitationNumber: number | null;
        sessionStatus: SessionStatus;
      } & AssignmentColumns,
    ) => Omit<Prisma.WorkItemCreateManyInput, 'workProgramId' | 'position'>,
  ): Promise<WorkProgramDto> {
    try {
      const targetProgramId = await this.prisma.$transaction(async (tx) => {
        // the student's «متابعة العرضات» lock first, then everything is read under it
        const owner = await tx.workItem.findUnique({
          where: { id: itemId },
          select: { program: { select: { studentId: true } } },
        });
        if (!owner) throw itemNotFound();
        const studentId = owner.program.studentId;
        await lockSessionWork(tx, [targetSessionId]);
        await lockRecitations(tx, [studentId]);
        const before = await snapshotRecitations(tx, [studentId]);
        const source = await tx.workItem.findUnique({
          where: { id: itemId },
          select: {
            id: true,
            type: true,
            description: true,
            status: true,
            recitationNumber: true,
            ...ASSIGNMENT_SELECT,
            program: {
              select: {
                studentId: true,
                session: {
                  select: {
                    id: true,
                    date: true,
                    startTime: true,
                    status: true,
                  },
                },
              },
            },
          },
        });
        if (!source) throw itemNotFound();
        await this.assertStudent(
          tx,
          actor,
          source.program.session.id,
          source.program.studentId,
        );
        const fields = plan({
          ...source,
          sessionStatus: source.program.session.status,
        });
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
        // A postponed recitation (or a cancelled session's) is continued by the next one of its
        // surah already planned: no second copy of it
        const surah = trackedSurah(source);
        const sourceEntry = recitationEntry(
          source.status,
          source.program.session.status,
        );
        if (
          fields.carriedFromItemId &&
          surah !== null &&
          (sourceEntry === 'POSTPONED' || sourceEntry === 'SESSION_CANCELLED')
        ) {
          const planned = (
            await tx.workItem.findMany({
              where: {
                ...recitationsOf([studentId], [surah]),
                status: WorkStatus.NOT_EVALUATED,
                program: {
                  studentId,
                  session: { status: { not: SessionStatus.CANCELLED } },
                },
              },
              select: {
                recitationNumber: true,
                program: {
                  select: {
                    session: { select: { date: true, startTime: true } },
                  },
                },
              },
            })
          )
            .map((i) => ({
              number: i.recitationNumber,
              start: sessionStart(
                i.program.session.date,
                i.program.session.startTime,
              ),
            }))
            .filter((i) => i.start > sourceStart)
            .sort((a, b) => a.start.localeCompare(b.start))[0];
          if (planned)
            throw conflict(
              'WORK_RECITATION_CONTINUED',
              `${planned.number ? `العرضة ${planned.number}` : 'عرضة'} من سورة ${surahName(surah) ?? surah} مبرمجة يوم ${startAr(planned.start)}: هي التي تُكمل العرضة المؤجلة، فلا حاجة إلى نقلها`,
            );
        }
        const created = await tx.workItem.create({
          data: {
            ...fields,
            status: WorkStatus.NOT_EVALUATED,
            workProgramId: program.id,
            position: await this.nextPosition(tx, program.id),
            createdByUserId: actor.userId,
          },
          select: { id: true },
        });
        await this.numberRecitations(tx, source.program.studentId, [
          created.id,
        ]);
        await settleRecitations(tx, [studentId], before, PLANNING_REFUSAL);
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
   * One student's work in one session: a teacher must be in the session's
   * team and — in a shared session — manage that student's class there
   * (its supervisor, or assigned to the class). Admins: always.
   */
  private async assertStudent(
    db: Db,
    actor: WorkActor,
    sessionId: string,
    studentId: string,
  ) {
    if (actor.kind === 'teacher')
      await this.access.assertSessionStudentAccess(
        actor.userId,
        sessionId,
        studentId,
        db,
      );
  }

  /**
   * Programs of SHARED sessions to leave out of a list: for a teacher, those
   * of students whose class (on the session date) they do not manage there;
   * for a class filter, those of other participating classes' students.
   * Normal sessions are never concerned (few rows: shared sessions only).
   */
  private async excludedInSharedSessions(
    teacherId: string | null,
    groupClassId: string | undefined,
  ) {
    if (!teacherId && !groupClassId) return [];
    const enrolledOnDate = (condition: Prisma.Sql) => Prisma.sql`EXISTS (
      SELECT 1 FROM student_enrollments e
      WHERE e."studentId" = w."studentId"
        AND e."startDate" <= s.date AND (e."endDate" IS NULL OR e."endDate" > s.date)
        AND e."groupClassId" = ANY(ARRAY${sessionClassIdsSql('s')})
        AND ${condition}
    )`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT w.id FROM work_programs w
      JOIN sessions s ON s.id = w."sessionId"
      WHERE EXISTS (SELECT 1 FROM session_classes x WHERE x."sessionId" = s.id)
        AND (
          ${
            teacherId
              ? Prisma.sql`(EXISTS (SELECT 1 FROM session_teachers st WHERE st."sessionId" = s.id AND st."teacherId" = ${teacherId}::uuid)
                  AND NOT ${enrolledOnDate(managesClassInSession('s', Prisma.sql`e."groupClassId"`, teacherId))})`
              : Prisma.sql`FALSE`
          }
          OR ${
            groupClassId
              ? Prisma.sql`NOT ${enrolledOnDate(Prisma.sql`e."groupClassId" = ${groupClassId}::uuid`)}`
              : Prisma.sql`FALSE`
          }
        )`;
    return rows.map((r) => r.id);
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
        extraClasses: { select: { groupClassId: true } },
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
          AND e."groupClassId" = ANY(${[session.groupClassId, ...session.extraClasses.map((c) => c.groupClassId)]}::uuid[])
          AND ${expectedOnDate('e', Prisma.sql`${date}::date`)}
      ) AS ok`;
    if (!row?.ok)
      throw badRequest(
        'WORK_STUDENT_NOT_IN_SESSION',
        'الطالب ليس من طلبة قسم هذه الحصة في تاريخها',
      );
    // A shared session: only a student of a class the teacher manages there
    await this.assertStudent(tx, actor, sessionId, studentId);
    return session;
  }

  private async eligibleSessionIds(
    db: Db,
    input: {
      studentId: string;
      teacherId: string | null;
      /** strict bounds "YYYY-MM-DDTHH:mm" */
      after: string | null;
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
            AND e."groupClassId" = ANY(ARRAY${sessionClassIdsSql('s')})
            AND ${expectedOnDate('e', Prisma.sql`s.date`)}
            ${
              // A teacher of the session who manages the student's class there
              input.teacherId
                ? Prisma.sql`AND ${managesClassInSession('s', Prisma.sql`e."groupClassId"`, input.teacherId)}`
                : Prisma.empty
            }
        )
        ${
          input.after
            ? Prisma.sql`AND (s.date, s."startTime") > (${input.after.slice(0, 10)}::date, ${input.after.slice(11, 16)}::time)`
            : Prisma.empty
        }
      ORDER BY s.date, s."startTime"
      LIMIT 60`;
    return rows.map((r) => r.id);
  }

  /**
   * Where an item may be transferred / continued: any upcoming session after its own (the
   * numbers then follow the chronology by themselves). `none`: a postponed (or a cancelled
   * session's) whole-surah عرضة whose surah already has its next recitation planned — that one
   * continues it, there is nothing to transfer. Read-only (the write checks again).
   */
  private async scheduleBounds(
    itemId: string,
    studentId: string,
    purpose: 'TRANSFER' | 'NEXT',
  ): Promise<{ after: string; none: boolean }> {
    const item = await this.prisma.workItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        type: true,
        status: true,
        quranAssignmentKind: true,
        quranFromSurah: true,
        program: {
          select: {
            studentId: true,
            session: { select: { date: true, startTime: true, status: true } },
          },
        },
      },
    });
    if (!item || item.program.studentId !== studentId) throw itemNotFound();
    const own = sessionStart(
      item.program.session.date,
      item.program.session.startTime,
    );
    const surah = trackedSurah(item);
    const entry = recitationEntry(item.status, item.program.session.status);
    if (
      purpose !== 'TRANSFER' ||
      surah === null ||
      (entry !== 'POSTPONED' && entry !== 'SESSION_CANCELLED')
    )
      return { after: own, none: false };
    const planned = await this.prisma.workItem.findMany({
      where: {
        ...recitationsOf([studentId], [surah]),
        status: WorkStatus.NOT_EVALUATED,
        program: {
          studentId,
          session: { status: { not: SessionStatus.CANCELLED } },
        },
      },
      select: {
        program: {
          select: { session: { select: { date: true, startTime: true } } },
        },
      },
    });
    return {
      after: own,
      none: planned.some(
        (p) =>
          sessionStart(p.program.session.date, p.program.session.startTime) >
          own,
      ),
    };
  }

  /**
   * The program row locked for this transaction, after the access check. The student's
   * «متابعة العرضات» lock comes first (the order every change of their recitations follows).
   */
  private async lockProgram(tx: Tx, actor: WorkActor, id: string) {
    const owner = await tx.workProgram.findUnique({
      where: { id },
      select: { studentId: true, sessionId: true },
    });
    if (owner) {
      await lockSessionWork(tx, [owner.sessionId]);
      await lockRecitations(tx, [owner.studentId]);
    }
    await tx.$queryRaw`SELECT id FROM work_programs WHERE id = ${id}::uuid FOR UPDATE`;
    const program = await tx.workProgram.findUnique({
      where: { id },
      select: {
        id: true,
        version: true,
        sessionId: true,
        studentId: true,
        overallEvaluation: true,
        session: { select: { status: true, date: true, startTime: true } },
      },
    });
    if (!program) throw programNotFound();
    await this.assertStudent(tx, actor, program.sessionId, program.studentId);
    return program;
  }

  /** Planning changes of a saved item (never its result); 'stale' on a version mismatch. */
  private async editItem(
    tx: Tx,
    actor: WorkActor,
    programId: string,
    studentId: string,
    itemId: string,
    edit: WorkItemEditDto,
  ): Promise<'ok' | 'stale'> {
    const current = await tx.workItem.findFirst({
      where: { id: itemId, workProgramId: programId },
      select: {
        type: true,
        description: true,
        status: true,
        recitationNumber: true,
        continuedFromItemId: true,
        recitationCycleId: true,
        ...ASSIGNMENT_SELECT,
      },
    });
    if (!current) throw itemNotFound();
    // «متابعة العرضات»: a structured عرضة's number is the server's (stable in its surah)
    if (
      trackedSurah(current) !== null &&
      edit.recitationNumber !== undefined &&
      (edit.type ?? current.type) === WorkType.RECITATION &&
      edit.recitationNumber !== current.recitationNumber
    )
      throw badRequest(
        'WORK_RECITATION_NUMBER_MANAGED',
        'رقم العرضة يُحدَّد تلقائيًا في سجل السورة',
      );
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
    // Structured assignment: omitted = kept (re-validated if the type changes), null = removed
    const before = storedOf(current);
    let after: StoredAssignment | null;
    if (edit.assignment === null) after = null;
    else if (edit.assignment !== undefined)
      after = resolveAssignment(type, edit.assignment);
    else if (before && type !== current.type) {
      const recheck = resolveAssignment(type, inputOf(before));
      // Same task: keep the stored range, edition and workload when they still apply
      after = sameAssignment(recheck, before) ? before : recheck;
    } else after = before;
    if (after && before && sameAssignment(after, before)) after = before;
    // A server-written description follows its assignment unless the teacher wrote their own
    const generated = (
      a: StoredAssignment | null,
      t: WorkType,
      n: number | null,
    ) => (a ? describeAssignment(t, a, n ? recitationOrdinal(n) : null) : null);
    let description = edit.description ?? current.description;
    const unchanged =
      after === before &&
      type === current.type &&
      recitationNumber === current.recitationNumber;
    // (an older default wording is recognised too, but never rewritten by a no-op edit)
    if (
      edit.description === undefined &&
      after &&
      before &&
      !unchanged &&
      isGeneratedDescription(
        current.description,
        current.type,
        before,
        current.recitationNumber
          ? recitationOrdinal(current.recitationNumber)
          : null,
      )
    )
      description = generated(after, type, recitationNumber) as string;
    if (
      type === current.type &&
      description === current.description &&
      recitationNumber === current.recitationNumber &&
      after === before
    )
      return 'ok';
    // «متابعة العرضات»: an evaluated عرضة keeps its surah and type (its place in the history);
    // a pending one moved to another surah (or becoming one) is numbered in that surah
    const oldSurah = trackedSurah(current);
    const newSurah = trackedSurah({
      type,
      quranAssignmentKind: after?.quranAssignmentKind ?? null,
      quranFromSurah: after?.quranFromSurah ?? null,
    });
    const moves = oldSurah !== newSurah;
    if (
      moves &&
      oldSurah !== null &&
      current.status !== WorkStatus.NOT_EVALUATED
    )
      throw conflict(
        'RECITATION_ATTEMPT_EVALUATED',
        'عرضة مقيَّمة في سجل العرضات: لا يُغيَّر نوعها أو سورتها (عدّل نتيجتها إن لزم)',
      );
    const { count } = await tx.workItem.updateMany({
      where: { id: itemId, version: edit.version },
      data: {
        type,
        description,
        recitationNumber,
        ...(after === before ? {} : assignmentData(after)),
        // a record of the former cycle model is left as it was, unless the item leaves its surah
        ...(moves && current.recitationCycleId
          ? { recitationCycleId: null }
          : {}),
        updatedByUserId: actor.userId,
        version: { increment: 1 },
      },
    });
    if (count === 0) return 'stale';
    if (
      moves &&
      newSurah !== null &&
      current.status === WorkStatus.NOT_EVALUATED
    )
      await this.numberRecitations(tx, studentId, [itemId]);
    return 'ok';
  }

  private async appendItems(
    tx: Tx,
    actor: WorkActor,
    programId: string,
    studentId: string,
    items: NewWorkItemDto[],
  ) {
    const start = await this.nextPosition(tx, programId);
    const created = await tx.workItem.createManyAndReturn({
      data: items.map((item, i) => ({
        ...newItem(item, actor.userId),
        workProgramId: programId,
        position: start + i,
      })),
      select: { id: true },
    });
    await this.numberRecitations(
      tx,
      studentId,
      created.map((c) => c.id),
    );
  }

  /**
   * «متابعة العرضات»: new / moved structured recitations (one whole surah). The same surah twice
   * in one session's program is refused (an accidental duplicate); any number of recitations
   * across sessions is allowed. Their numbers come from settleRecitations (the chronology).
   */
  private async numberRecitations(
    tx: Tx,
    studentId: string,
    itemIds: string[],
  ) {
    const items = (
      await tx.workItem.findMany({
        where: { id: { in: itemIds } },
        select: {
          id: true,
          workProgramId: true,
          type: true,
          ...ASSIGNMENT_SELECT,
        },
      })
    ).filter((i) => trackedSurah(i) !== null);
    for (const item of items) {
      const twice = await tx.workItem.count({
        where: {
          ...recitationsOf([studentId], [trackedSurah(item) as number]),
          workProgramId: item.workProgramId,
          id: { not: item.id },
        },
      });
      if (twice)
        throw conflict(
          'WORK_RECITATION_DUPLICATE',
          'عرضة هذه السورة مبرمجة في هذه الحصة من قبل',
        );
    }
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
    overall?: {
      overallEvaluation: WorkPerformance;
      overallEvaluatedAt: Date;
      overallEvaluatedByUserId: string;
    },
  ) {
    await tx.workProgram.update({
      where: { id: programId },
      data: {
        updatedByUserId: actor.userId,
        ...(generalNotes !== undefined ? { generalNotes } : {}),
        ...overall,
        // the program's own fields changed: version + 1 (one increment for both)
        ...(generalNotes !== undefined || overall
          ? { version: { increment: 1 } }
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
    const row = await db.workProgram.findUniqueOrThrow({
      where: { id },
      include: programInclude,
    });
    return toDto(row, await this.clock(db), await recitationSummaries(db, row));
  }
}

/**
 * The description of a recitation given attempt number `n`: a text written by the server (with
 * any number, or none) follows the number; «العرضة الثانية …» in a teacher's own text is
 * renumbered too; any other text is the teacher's and stays as written.
 */
function renumbered(
  item: {
    description: string;
    recitationNumber: number | null;
  } & AssignmentColumns,
  n: number,
): string {
  const a = storedOf(item);
  if (a) {
    const defaults = [
      describeAssignment(WorkType.RECITATION, a, null),
      ...(item.recitationNumber
        ? [
            describeAssignment(
              WorkType.RECITATION,
              a,
              recitationOrdinal(item.recitationNumber),
            ),
          ]
        : []),
    ];
    if (defaults.includes(item.description))
      return describeAssignment(WorkType.RECITATION, a, recitationOrdinal(n));
  }
  return hasRecitationOrdinal(item.description)
    ? nextRecitationDescription(item.description, n)
    : item.description;
}

/** A new item: unevaluated; a number only for a recitation; a structured assignment if sent. */
// ───────────────────────── «متابعة العرضات»: numbering ─────────────────────────

const HISTORY_ROW_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  recitationNumber: true,
  type: true,
  description: true,
  ...ASSIGNMENT_SELECT,
  program: {
    select: {
      studentId: true,
      student: personName,
      session: { select: { date: true, startTime: true, status: true } },
    },
  },
} as const;
type LoadedRow = Prisma.WorkItemGetPayload<{
  select: typeof HISTORY_ROW_SELECT;
}>;

const historyRow = (i: {
  id: string;
  status: WorkStatus;
  createdAt: Date;
  recitationNumber: number | null;
  program: { session: { date: Date; startTime: Date; status: SessionStatus } };
}): HistoryRow => ({
  id: i.id,
  status: i.status,
  sessionStatus: i.program.session.status,
  start: sessionStart(i.program.session.date, i.program.session.startTime),
  createdAt: i.createdAt,
  stored: i.recitationNumber,
});

/** These students' histories, one group per (student, surah). */
async function loadHistories(tx: Tx, studentIds: string[]) {
  const rows = await tx.workItem.findMany({
    where: recitationsOf(studentIds),
    select: HISTORY_ROW_SELECT,
  });
  const groups = new Map<string, LoadedRow[]>();
  for (const r of rows) {
    const key = `${r.program.studentId}:${r.quranFromSurah}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return groups;
}

/** The contradictions that already exist (legacy data): never a reason to refuse a change. */
export type RecitationSnapshot = ReadonlySet<string>;

/**
 * «متابعة العرضات» before a change: call right after lockRecitations, before writing. Returns
 * the performed attempts whose number ALREADY contradicts their place (old data).
 */
export async function snapshotRecitations(
  tx: Tx,
  studentIds: string[],
): Promise<RecitationSnapshot> {
  const known = new Set<string>();
  for (const rows of (await loadHistories(tx, studentIds)).values())
    for (const id of numberSurah(rows.map(historyRow)).contradictions.keys())
      known.add(id);
  return known;
}

/**
 * «متابعة العرضات» after a change (same transaction, same lock): every history of these students
 * is numbered again — provisional numbers (and the server-written descriptions that name them)
 * follow; `settling` attempts (performed in this change) take their place's number for good. A
 * NEW contradiction of a performed attempt's number refuses the whole change (409 `code`).
 */
export async function settleRecitations(
  tx: Tx,
  studentIds: string[],
  before: RecitationSnapshot,
  refusal: { code: string; lead: string },
  settling: ReadonlySet<string> = new Set(),
) {
  const writes: { row: LoadedRow; number: number }[] = [];
  for (const [key, rows] of await loadHistories(tx, studentIds)) {
    const { numbers, contradictions } = numberSurah(
      rows.map(historyRow),
      settling,
    );
    for (const id of contradictions.keys()) {
      if (before.has(id)) continue;
      const row = rows.find((r) => r.id === id)!;
      const { firstName, lastName } = row.program.student.person;
      throw recitationContradiction(refusal.code, refusal.lead, {
        number: row.recitationNumber as number,
        surah: Number(key.split(':')[1]),
        start: sessionStart(
          row.program.session.date,
          row.program.session.startTime,
        ),
        student: `${firstName} ${lastName}`,
      });
    }
    for (const row of rows) {
      const entry = recitationEntry(row.status, row.program.session.status);
      // a performed attempt's number is history: written once (when performed), never again
      if (isAttempt(entry) && !settling.has(row.id)) continue;
      const number = numbers.get(row.id)!;
      if (number !== row.recitationNumber) writes.push({ row, number });
    }
  }
  for (const { row, number } of writes)
    await tx.workItem.update({
      where: { id: row.id },
      data: {
        recitationNumber: number,
        description: renumbered(row, number),
        // a form opened before sees the change (stale edits refused, as usual)
        version: { increment: 1 },
      },
    });
}

/**
 * A change of sessions (a move, a cancellation, a restoration) around `change`: the sessions'
 * work and the students with whole-surah recitations there are locked (in the global order),
 * the histories numbered again afterwards; a performed recitation contradicted refuses it all.
 */
export async function aroundSessionChange<T>(
  tx: Tx,
  sessionIds: string[],
  refusal: { code: string; lead: string },
  change: () => Promise<T>,
): Promise<T> {
  if (!sessionIds.length) return change();
  await lockSessionWork(tx, sessionIds);
  const rows = await tx.workItem.findMany({
    where: {
      program: { sessionId: { in: sessionIds } },
      type: WorkType.RECITATION,
      quranAssignmentKind: WorkAssignmentKind.SURAH_RANGE,
    },
    select: { program: { select: { studentId: true } } },
  });
  const students = [...new Set(rows.map((r) => r.program.studentId))];
  if (!students.length) return change();
  await lockRecitations(tx, students);
  const before = await snapshotRecitations(tx, students);
  const result = await change();
  await settleRecitations(tx, students, before, refusal);
  return result;
}

function newItem(item: NewWorkItemDto, userId: string) {
  const recitationNumber =
    item.type === WorkType.RECITATION ? (item.recitationNumber ?? null) : null;
  const assignment = item.assignment
    ? resolveAssignment(item.type, item.assignment)
    : null;
  const description =
    item.description ||
    (assignment
      ? describeAssignment(
          item.type,
          assignment,
          recitationNumber ? recitationOrdinal(recitationNumber) : null,
        )
      : item.description);
  return {
    type: item.type,
    description,
    status: WorkStatus.NOT_EVALUATED,
    recitationNumber,
    ...(assignment ? assignmentData(assignment) : {}),
    createdByUserId: userId,
    updatedByUserId: userId,
  };
}

type AssignmentColumns = Prisma.WorkItemGetPayload<{
  select: typeof ASSIGNMENT_SELECT;
}>;

/** The stored assignment of a row, or null for a free-text item. */
function storedOf(row: AssignmentColumns): StoredAssignment | null {
  if (!row.quranAssignmentKind) return null;
  return {
    quranAssignmentKind: row.quranAssignmentKind,
    quranEditionId: row.quranEditionId as string,
    quranFromSurah: row.quranFromSurah as number,
    quranFromAyah: row.quranFromAyah as number,
    quranToSurah: row.quranToSurah as number,
    quranToAyah: row.quranToAyah as number,
    quranFromPage: row.quranFromPage,
    quranToPage: row.quranToPage,
    quranWorkload:
      row.quranWorkload as unknown as StoredAssignment['quranWorkload'],
  };
}

/** The references a stored assignment was made from (to re-validate it for another work type). */
function inputOf(a: StoredAssignment): AssignmentInput {
  if (a.quranAssignmentKind === WorkAssignmentKind.PAGE_RANGE)
    return {
      kind: a.quranAssignmentKind,
      fromPage: a.quranFromPage,
      toPage: a.quranToPage,
    };
  const whole =
    a.quranFromAyah === 1 &&
    a.quranToAyah ===
      edition(a.quranEditionId).engine.ayahCount(a.quranToSurah);
  return a.quranAssignmentKind === WorkAssignmentKind.SURAH_RANGE && whole
    ? {
        kind: a.quranAssignmentKind,
        fromSurah: a.quranFromSurah,
        toSurah: a.quranToSurah,
      }
    : {
        kind: a.quranAssignmentKind,
        fromSurah: a.quranFromSurah,
        fromAyah: a.quranFromAyah,
        toSurah: a.quranToSurah,
        toAyah: a.quranToAyah,
      };
}

/** A transferred / next item keeps its source's assignment verbatim (no recomputation). */
function copyAssignment(source: AssignmentColumns) {
  const a = storedOf(source);
  return a ? assignmentData(a) : {};
}

/** Columns to write (an assignment, or all null). */
function assignmentData(a: StoredAssignment | null) {
  return a
    ? {
        ...a,
        quranWorkload: a.quranWorkload as unknown as Prisma.InputJsonValue,
      }
    : { ...NO_ASSIGNMENT, quranWorkload: Prisma.DbNull };
}

/** The response form of an item's assignment (null: free text). */
function assignmentOf(row: AssignmentColumns) {
  const a = storedOf(row);
  return a
    ? {
        kind: a.quranAssignmentKind,
        editionId: a.quranEditionId,
        fromSurah: a.quranFromSurah,
        fromAyah: a.quranFromAyah,
        toSurah: a.quranToSurah,
        toAyah: a.quranToAyah,
        fromPage: a.quranFromPage,
        toPage: a.quranToPage,
      }
    : null;
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

const evaluationRefused = (reason: EvaluationBlock) =>
  reason === 'SESSION_CANCELLED'
    ? conflict(
        'WORK_SESSION_CANCELLED',
        'لا يمكن تقييم برنامج العمل لحصة ملغاة',
      )
    : conflict(
        'WORK_SESSION_NOT_STARTED',
        'لا يمكن تقييم برنامج العمل قبل بداية الحصة',
      );

const alreadyScheduled = (carry: boolean) =>
  conflict(
    carry ? 'WORK_ITEM_ALREADY_TRANSFERRED' : 'WORK_RECITATION_ALREADY_PLANNED',
    carry
      ? 'سبق نقل هذا العمل إلى هذه الحصة'
      : 'العرضة التالية لهذا العمل مبرمجة مسبقًا في هذه الحصة',
  );
