import { Prisma } from '../generated/prisma/client.js';
import { badRequest, conflict } from '../common/errors.js';
import { classNotFound } from './scheduling-errors.js';

type Tx = Prisma.TransactionClient;

/**
 * «الحصص المشتركة» — THE participant rule, in one place:
 *
 *   participants of a weekly slot / session
 *     = its HOST class (WeeklySchedule / Session.groupClassId)
 *     + its ADDITIONAL classes (weekly_schedule_classes / session_classes).
 *
 * A normal slot / session has no additional class: its participants are its
 * host alone, exactly as before shared sessions existed. A shared one is still
 * ONE lesson: one room, one supervisor, one team snapshot.
 */

/** SQL: the participating class ids of the session aliased `alias` (a subquery). */
export const sessionClassIdsSql = (alias: string): Prisma.Sql => {
  const a = Prisma.raw(alias);
  return Prisma.sql`(SELECT ${a}."groupClassId" UNION ALL SELECT sc."groupClassId" FROM session_classes sc WHERE sc."sessionId" = ${a}.id)`;
};

/** SQL: the participating class ids of the weekly slot aliased `alias` (a subquery). */
export const scheduleClassIdsSql = (alias: string): Prisma.Sql => {
  const a = Prisma.raw(alias);
  return Prisma.sql`(SELECT ${a}."groupClassId" UNION ALL SELECT wc."groupClassId" FROM weekly_schedule_classes wc WHERE wc."weeklyScheduleId" = ${a}.id)`;
};

/** Prisma: sessions a class takes part in (as host or additional class). */
export const sessionOfClass = (
  where: Prisma.GroupClassWhereInput,
): Prisma.SessionWhereInput => ({
  OR: [
    { groupClass: where },
    { extraClasses: { some: { groupClass: where } } },
  ],
});

/** Prisma: weekly slots a class takes part in (as host or additional class). */
export const scheduleOfClass = (
  where: Prisma.GroupClassWhereInput,
): Prisma.WeeklyScheduleWhereInput => ({
  OR: [
    { groupClass: where },
    { extraClasses: { some: { groupClass: where } } },
  ],
});

/** Prisma select of the additional class ids (with participantIds). */
export const extraClassIds = {
  extraClasses: { select: { groupClassId: true } },
} as const;

/** Host first, then the additional classes. */
export const participantIds = (row: {
  groupClassId: string;
  extraClasses: { groupClassId: string }[];
}) => [row.groupClassId, ...row.extraClasses.map((e) => e.groupClassId)];

/** The request's additional classes: never repeated, never the host itself. */
export function assertParticipantShape(hostId: string, extraIds: string[]) {
  if (new Set(extraIds).size !== extraIds.length)
    throw badRequest(
      'SHARED_CLASS_DUPLICATE',
      'لا يمكن تكرار القسم نفسه ضمن الأقسام المشاركة',
    );
  if (extraIds.includes(hostId))
    throw badRequest(
      'SHARED_CLASS_IS_HOST',
      'القسم الأساسي مشارك بطبيعته: لا تُضفه ضمن الأقسام الإضافية',
    );
}

const teamSelect = {
  id: true,
  branchId: true,
  status: true,
  group: { select: { status: true } },
  supervisor: { select: { id: true, status: true } },
  assistants: { select: { teacher: { select: { id: true, status: true } } } },
} satisfies Prisma.GroupClassSelect;
type TeamRow = Prisma.GroupClassGetPayload<{ select: typeof teamSelect }>;

export interface Participants {
  hostId: string;
  extraIds: string[];
  /** Host first */
  groupClassIds: string[];
  branchId: string;
  supervisorId: string;
  supervisorActive: boolean;
  /** The HOST class is ACTIVE (unchanged single-class rule) */
  classActive: boolean;
  /** Every participant is ACTIVE in an ACTIVE group */
  running: boolean;
  /** Union of the participants' ACTIVE assistants (a session's team snapshot) */
  activeAssistantIds: string[];
  /** Union of the participants' assigned assistants, any status (weekly occupancy) */
  assignedAssistantIds: string[];
}

const runs = (c: TeamRow) =>
  c.status === 'ACTIVE' && c.group.status === 'ACTIVE';

/**
 * Host + additional classes, loaded and — for a SHARED slot / session —
 * validated: same supervisor, same branch, every class and group active.
 * (A host alone keeps the existing single-class rules of its callers.)
 * undefined when the host does not exist; 404 for a missing additional class.
 */
export async function loadParticipants(
  tx: Tx,
  hostId: string,
  extraIds: string[],
): Promise<Participants | undefined> {
  assertParticipantShape(hostId, extraIds);
  const rows = await tx.groupClass.findMany({
    where: { id: { in: [hostId, ...extraIds] } },
    select: teamSelect,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const host = byId.get(hostId);
  if (!host) return undefined;
  const extras = extraIds.map((id) => byId.get(id));
  if (extras.some((e) => e === undefined)) throw classNotFound();
  const all = [host, ...(extras as TeamRow[])];
  if (extraIds.length > 0) {
    if (all.some((c) => c.supervisor.id !== host.supervisor.id))
      throw conflict(
        'SHARED_SUPERVISOR_MISMATCH',
        'لا تكون الحصة مشتركة إلا بين أقسام لها المعلم المشرف نفسه',
      );
    if (all.some((c) => c.branchId !== host.branchId))
      throw conflict(
        'SHARED_BRANCH_MISMATCH',
        'لا تكون الحصة مشتركة إلا بين أقسام من الفرع نفسه',
      );
    if (!all.every(runs))
      throw conflict(
        'SHARED_CLASS_INACTIVE',
        'أحد الأقسام المشاركة أو مجموعته غير نشط: لا يمكن إشراكه في حصة مشتركة',
      );
  }
  const assistants = all.flatMap((c) => c.assistants.map((a) => a.teacher));
  const unique = (ids: string[]) =>
    [...new Set(ids)].filter((id) => id !== host.supervisor.id);
  return {
    hostId,
    extraIds,
    groupClassIds: all.map((c) => c.id),
    branchId: host.branchId,
    supervisorId: host.supervisor.id,
    supervisorActive: host.supervisor.status === 'ACTIVE',
    classActive: host.status === 'ACTIVE',
    running: all.every(runs),
    activeAssistantIds: unique(
      assistants.filter((t) => t.status === 'ACTIVE').map((t) => t.id),
    ),
    assignedAssistantIds: unique(assistants.map((t) => t.id)),
  };
}
