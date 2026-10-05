import { WEEK_ORDER } from "@/lib/i18n"
import { minutesBetween } from "@/lib/format"
import type {
  Branch,
  Group,
  ID,
  ISODate,
  Room,
  ScheduleSlot,
  Student,
  Teacher,
  TeachingRole,
  Weekday,
  WeeklySchedule,
} from "@/types/domain"

/** Pure helpers over domain data. They take data as arguments so they
 *  work the same with mock arrays now and API responses later. */

export function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`
}

export function indexById<T extends { id: ID }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]))
}

export function ageOn(dateOfBirth: ISODate, reference: ISODate) {
  const dob = new Date(dateOfBirth)
  const ref = new Date(reference)
  let age = ref.getUTCFullYear() - dob.getUTCFullYear()
  const beforeBirthday =
    ref.getUTCMonth() < dob.getUTCMonth() ||
    (ref.getUTCMonth() === dob.getUTCMonth() &&
      ref.getUTCDate() < dob.getUTCDate())
  if (beforeBirthday) age--
  return age
}

const JS_DAY_TO_WEEKDAY: Weekday[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
]

export function weekdayOf(date: ISODate): Weekday {
  return JS_DAY_TO_WEEKDAY[new Date(date).getUTCDay()]
}

export function sortSlots<S extends ScheduleSlot>(schedule: S[]): S[] {
  return [...schedule].sort(
    (a, b) =>
      WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day) ||
      a.start.localeCompare(b.start)
  )
}

export function weeklyMinutes(schedule: ScheduleSlot[]) {
  return schedule.reduce(
    (total, slot) => total + Math.max(0, minutesBetween(slot.start, slot.end)),
    0
  )
}

export function roomName(roomsById: Map<ID, Room>, roomId: ID) {
  return roomsById.get(roomId)?.name ?? "—"
}

export function roomsOfBranch(branchId: ID, rooms: Room[]) {
  return rooms.filter((r) => r.branchId === branchId)
}

/** A group's weekly sessions, in week order. */
export function schedulesOf(groupId: ID, schedules: WeeklySchedule[]) {
  return sortSlots(schedules.filter((s) => s.groupId === groupId))
}

/** Supervisor + assistants: everyone who must be free when the group meets. */
export function groupTeacherIds(group: Pick<Group, "supervisorId" | "assistantIds">) {
  return [group.supervisorId, ...group.assistantIds.filter((id) => id !== group.supervisorId)]
}

export function teachingRoleIn(group: Group, teacherId: ID): TeachingRole | null {
  if (group.supervisorId === teacherId) return "SUPERVISOR"
  if (group.assistantIds.includes(teacherId)) return "ASSISTANT"
  return null
}

export interface TeacherAssignment {
  group: Group
  role: TeachingRole
}

/** Groups a teacher works in, supervisor assignments first. */
export function teacherAssignments(teacherId: ID, groups: Group[]) {
  const assignments: TeacherAssignment[] = []
  for (const group of groups) {
    const role = teachingRoleIn(group, teacherId)
    if (role) assignments.push({ group, role })
  }
  return assignments.sort((a, b) =>
    a.role === b.role ? 0 : a.role === "SUPERVISOR" ? -1 : 1
  )
}

export function groupTeachers(group: Group, teachersById: Map<ID, Teacher>) {
  return {
    supervisor: teachersById.get(group.supervisorId),
    assistants: group.assistantIds
      .map((id) => teachersById.get(id))
      .filter((t): t is Teacher => Boolean(t)),
  }
}

export function studentsInGroup(groupId: ID, students: Student[]) {
  return students.filter((s) => s.groupId === groupId)
}

export function countActiveStudentsByGroup(students: Student[]) {
  const counts = new Map<ID, number>()
  for (const s of students) {
    if (s.status !== "ACTIVE") continue
    counts.set(s.groupId, (counts.get(s.groupId) ?? 0) + 1)
  }
  return counts
}

/** A teacher's sessions across all their groups, for schedule previews and workload. */
export function teacherWeeklySlots(teacherId: ID, groups: Group[], schedules: WeeklySchedule[]) {
  return teacherAssignments(teacherId, groups).flatMap(({ group, role }) =>
    schedulesOf(group.id, schedules).map((slot) => ({ slot, group, role }))
  )
}

/** Reference data most admin screens need to resolve ids into names. */
export interface Lookups {
  branches: Branch[]
  rooms: Room[]
  groups: Group[]
  teachers: Teacher[]
  schedules: WeeklySchedule[]
}

export function indexLookups({ branches, rooms, groups, teachers }: Lookups) {
  return {
    branchesById: indexById(branches),
    roomsById: indexById(rooms),
    groupsById: indexById(groups),
    teachersById: indexById(teachers),
  }
}

/** "Branch · Room" label for anything with a branchId and roomId (a group or a session). */
export function locationLabel(
  where: { branchId: ID; roomId: ID },
  branchesById: Map<ID, Branch>,
  roomsById: Map<ID, Room>
) {
  return `${branchesById.get(where.branchId)?.name ?? "—"} · ${roomName(roomsById, where.roomId)}`
}

/** Sessions of active groups held in a room — what "using a room" means. */
export function activeSessionsIn(
  where: { roomId?: ID; branchId?: ID },
  { schedules, groups }: Pick<Lookups, "schedules" | "groups">
) {
  const groupsById = indexById(groups)
  return schedules.filter(
    (s) =>
      (where.roomId === undefined || s.roomId === where.roomId) &&
      (where.branchId === undefined || s.branchId === where.branchId) &&
      groupsById.get(s.groupId)?.status === "ACTIVE"
  )
}

export function branchStats(branchId: ID, lookups: Lookups) {
  const branchRooms = roomsOfBranch(branchId, lookups.rooms)
  const sessions = activeSessionsIn({ branchId }, lookups)
  return {
    rooms: branchRooms.length,
    activeRooms: branchRooms.filter((r) => r.status === "ACTIVE").length,
    /** Active groups that meet in this branch (home branch or any session) */
    activeGroups: new Set([
      ...lookups.groups.filter((g) => g.branchId === branchId && g.status === "ACTIVE").map((g) => g.id),
      ...sessions.map((s) => s.groupId),
    ]).size,
    weeklySessions: sessions.length,
    weeklyMinutes: weeklyMinutes(sessions),
  }
}

/**
 * Where a session happens, relative to its group's usual location:
 * nothing if it's the usual room, the room if same branch, else "branch · room".
 */
export function sessionPlace(
  session: WeeklySchedule,
  group: Pick<Group, "branchId" | "roomId">,
  branchesById: Map<ID, Branch>,
  roomsById: Map<ID, Room>
) {
  if (session.roomId === group.roomId) return null
  if (session.branchId === group.branchId) return roomName(roomsById, session.roomId)
  return locationLabel(session, branchesById, roomsById)
}
