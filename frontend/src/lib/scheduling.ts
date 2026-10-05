/**
 * Scheduling rules for the frontend prototype.
 *
 * This is UX feedback only: the NestJS API will run the authoritative
 * validation. Everything here is pure (data in, conflicts out) so it can be
 * swapped for an API call without touching components.
 *
 * Rooms and teachers belong to the GroupClass, so a weekly slot occupies its
 * class's room and its class's teachers.
 */
import { minutesBetween } from "@/lib/format"
import { classTeacherIds, indexById, isRunning } from "@/lib/domain"
import type {
  Group,
  GroupClass,
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

/** A slot being created or edited, for a given class (possibly with unsaved team/room). */
export interface CandidateSlot extends ScheduleSlot {
  /** Set when editing an existing slot, so it is not compared with itself */
  id?: ID
  groupClass: Pick<GroupClass, "id" | "roomId" | "supervisorId" | "assistantIds">
}

export interface ConflictContext {
  schedules: WeeklySchedule[]
  groupClasses: GroupClass[]
  groups: Group[]
  /** Slots to leave out (e.g. the rows being replaced by a class form) */
  ignoreScheduleIds?: ID[]
}

/** Only slots of running classes occupy rooms and teachers. */
function occupying({ schedules, groupClasses, groups, ignoreScheduleIds = [] }: ConflictContext) {
  const classesById = indexById(groupClasses)
  const groupsById = indexById(groups)
  return schedules.flatMap((s) => {
    const groupClass = classesById.get(s.groupClassId)
    return !ignoreScheduleIds.includes(s.id) && groupClass && isRunning(groupClass, groupsById)
      ? [{ schedule: s, groupClass }]
      : []
  })
}

/**
 * Every reason the candidate slot cannot take place:
 * - ROOM: the class's room hosts another class at an overlapping time
 * - TEACHER: one of its teachers teaches another class at that time
 * - CLASS: the same class already meets at an overlapping time
 */
export function findConflicts(candidate: CandidateSlot, context: ConflictContext): ScheduleConflict[] {
  if (!isValidTimeRange(candidate.start, candidate.end)) return []
  const teacherIds = classTeacherIds(candidate.groupClass)
  const conflicts: ScheduleConflict[] = []

  for (const { schedule, groupClass } of occupying(context)) {
    if (schedule.id === candidate.id || !slotsOverlap(candidate, schedule)) continue
    if (groupClass.id === candidate.groupClass.id) {
      conflicts.push({ type: "CLASS", schedule, teacherIds: [] })
      continue
    }
    if (groupClass.roomId === candidate.groupClass.roomId) {
      conflicts.push({ type: "ROOM", schedule, teacherIds: [] })
    }
    const shared = classTeacherIds(groupClass).filter((id) => teacherIds.includes(id))
    if (shared.length > 0) conflicts.push({ type: "TEACHER", schedule, teacherIds: shared })
  }
  return conflicts
}

/** Active rooms of a branch free during the slot — suggested alternatives. */
export function freeRooms(slot: ScheduleSlot, branchId: ID, rooms: Room[], context: ConflictContext) {
  if (!isValidTimeRange(slot.start, slot.end)) return []
  const busy = new Set(
    occupying(context)
      .filter(({ schedule }) => slotsOverlap(slot, schedule))
      .map(({ groupClass }) => groupClass.roomId)
  )
  return rooms.filter((r) => r.branchId === branchId && r.status === "ACTIVE" && !busy.has(r.id))
}

/** A weekly slot row of a class being edited (`key` is the UI identity). */
export interface SlotDraft extends ScheduleSlot {
  key: string
  id?: ID
}

export interface SlotCheck {
  conflicts: ScheduleConflict[]
  freeRooms: Room[]
}

/**
 * Checks every valid row of a class form against other classes' slots AND
 * the form's other rows, using the form's (unsaved) room and team. The
 * class's saved slots are ignored because the form replaces them.
 */
export function checkClassSlots(
  drafts: SlotDraft[],
  draftClass: GroupClass,
  data: { schedules: WeeklySchedule[]; groupClasses: GroupClass[]; groups: Group[]; rooms: Room[] }
) {
  const results = new Map<string, SlotCheck>()
  const groupsById = indexById(data.groups)
  if (!draftClass.roomId || !isRunning(draftClass, groupsById)) return results

  const valid = drafts.filter((d) => isValidTimeRange(d.start, d.end))
  const context: ConflictContext = {
    schedules: [
      ...data.schedules.filter((s) => s.groupClassId !== draftClass.id),
      ...valid.map((d) => ({ id: `draft:${d.key}`, groupClassId: draftClass.id, day: d.day, start: d.start, end: d.end })),
    ],
    groupClasses: [...data.groupClasses.filter((c) => c.id !== draftClass.id), draftClass],
    groups: data.groups,
  }
  for (const draft of valid) {
    results.set(draft.key, {
      conflicts: findConflicts({ ...draft, id: `draft:${draft.key}`, groupClass: draftClass }, context),
      freeRooms: freeRooms(draft, draftClass.branchId, data.rooms, context),
    })
  }
  return results
}
