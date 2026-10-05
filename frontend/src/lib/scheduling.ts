/**
 * Scheduling rules for the frontend prototype.
 *
 * This is UX feedback only: the NestJS API will run the authoritative
 * validation. Keep everything here pure (data in, conflicts out) so this
 * module can be swapped for an API call without touching components.
 */
import { minutesBetween } from "@/lib/format"
import { groupTeacherIds, indexById } from "@/lib/domain"
import type {
  Group,
  ID,
  Room,
  ScheduleConflict,
  ScheduleSlot,
  TimeOfDay,
  WeeklySchedule,
} from "@/types/domain"

/** Same day and newStart < existingEnd AND newEnd > existingStart (touching edges don't overlap). */
export function slotsOverlap(a: ScheduleSlot, b: ScheduleSlot) {
  return a.day === b.day && a.start < b.end && a.end > b.start
}

export function isValidTimeRange(start: TimeOfDay, end: TimeOfDay) {
  return Boolean(start && end) && minutesBetween(start, end) > 0
}

/** A session being created or edited. */
export interface CandidateSession extends ScheduleSlot {
  /** Set when editing an existing session, so it is not compared with itself */
  id?: ID
  groupId: ID
  roomId: ID
  /** The candidate group's current team (may differ from saved data while editing a group) */
  teacherIds: ID[]
}

export interface ConflictContext {
  schedules: WeeklySchedule[]
  groups: Group[]
  /** Sessions to leave out of the comparison (e.g. the rows being replaced by a group form) */
  ignoreScheduleIds?: ID[]
}

/** Only sessions of active groups occupy rooms and teachers. */
function occupyingSchedules({ schedules, groups, ignoreScheduleIds = [] }: ConflictContext) {
  const groupsById = indexById(groups)
  return schedules.filter(
    (s) => !ignoreScheduleIds.includes(s.id) && groupsById.get(s.groupId)?.status === "ACTIVE"
  )
}

/**
 * Every reason the candidate cannot take place:
 * - ROOM: the room hosts another group at an overlapping time
 * - TEACHER: one of the group's teachers teaches another group at that time
 * - GROUP: the same group already meets at an overlapping time
 */
export function findConflicts(candidate: CandidateSession, context: ConflictContext): ScheduleConflict[] {
  if (!isValidTimeRange(candidate.start, candidate.end)) return []
  const groupsById = indexById(context.groups)
  const conflicts: ScheduleConflict[] = []

  for (const existing of occupyingSchedules(context)) {
    if (existing.id === candidate.id || !slotsOverlap(candidate, existing)) continue

    if (existing.groupId === candidate.groupId) {
      conflicts.push({ type: "GROUP", schedule: existing, teacherIds: [] })
      continue
    }
    if (existing.roomId === candidate.roomId) {
      conflicts.push({ type: "ROOM", schedule: existing, teacherIds: [] })
    }
    const other = groupsById.get(existing.groupId)
    const shared = other
      ? groupTeacherIds(other).filter((id) => candidate.teacherIds.includes(id))
      : []
    if (shared.length > 0) {
      conflicts.push({ type: "TEACHER", schedule: existing, teacherIds: shared })
    }
  }
  return conflicts
}

/** Active rooms of a branch that are free during the slot — used to suggest alternatives. */
export function freeRooms(
  slot: ScheduleSlot,
  branchId: ID,
  rooms: Room[],
  context: ConflictContext
) {
  if (!isValidTimeRange(slot.start, slot.end)) return []
  const busy = new Set(
    occupyingSchedules(context)
      .filter((s) => slotsOverlap(slot, s))
      .map((s) => s.roomId)
  )
  return rooms.filter((r) => r.branchId === branchId && r.status === "ACTIVE" && !busy.has(r.id))
}

/** A session row of a group being edited (`key` is the UI identity). */
export interface SessionDraft extends ScheduleSlot {
  key: string
  id?: ID
  branchId: ID
  roomId: ID
}

export interface SessionCheck {
  conflicts: ScheduleConflict[]
  freeRooms: Room[]
}

/**
 * Checks every complete row of a group form against other groups' sessions
 * AND the form's other rows. The group's saved sessions are ignored because
 * the form replaces them. Returns results keyed by draft key.
 */
export function checkGroupSessions(
  drafts: SessionDraft[],
  draftGroup: Group,
  data: { schedules: WeeklySchedule[]; groups: Group[]; rooms: Room[] }
) {
  const results = new Map<string, SessionCheck>()
  if (draftGroup.status !== "ACTIVE") return results

  const complete = drafts.filter((d) => d.roomId && isValidTimeRange(d.start, d.end))
  const asSchedules: WeeklySchedule[] = complete.map((d) => ({
    ...d,
    id: `draft:${d.key}`,
    groupId: draftGroup.id,
  }))
  const context: ConflictContext = {
    schedules: [...data.schedules.filter((s) => s.groupId !== draftGroup.id), ...asSchedules],
    groups: [...data.groups.filter((g) => g.id !== draftGroup.id), draftGroup],
  }
  const teacherIds = groupTeacherIds(draftGroup)

  for (const draft of complete) {
    const candidate = { ...draft, id: `draft:${draft.key}`, groupId: draftGroup.id, teacherIds }
    results.set(draft.key, {
      conflicts: findConflicts(candidate, context),
      freeRooms: freeRooms(draft, draft.branchId, data.rooms, context),
    })
  }
  return results
}
