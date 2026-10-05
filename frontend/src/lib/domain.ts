import { WEEK_ORDER } from "@/lib/i18n"
import { minutesBetween } from "@/lib/format"
import type {
  Branch,
  Group,
  ID,
  ISODate,
  ScheduleSlot,
  Student,
  Teacher,
  TeachingRole,
  Weekday,
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

export function sortSlots(schedule: ScheduleSlot[]) {
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

export function roomName(branch: Branch | undefined, roomId: ID) {
  return branch?.rooms.find((room) => room.id === roomId)?.name ?? "—"
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

/** Calendar of a teacher across all their groups, for schedule previews. */
export function teacherWeeklySlots(teacherId: ID, groups: Group[]) {
  return teacherAssignments(teacherId, groups).flatMap(({ group, role }) =>
    group.schedule.map((slot) => ({ slot, group, role }))
  )
}

/** Reference data most admin screens need to resolve ids into names. */
export interface Lookups {
  branches: Branch[]
  groups: Group[]
  teachers: Teacher[]
}

export function indexLookups({ branches, groups, teachers }: Lookups) {
  return {
    branchesById: indexById(branches),
    groupsById: indexById(groups),
    teachersById: indexById(teachers),
  }
}

/** "Branch · Room" label for a group. */
export function groupLocation(group: Group, branchesById: Map<ID, Branch>) {
  const branch = branchesById.get(group.branchId)
  return `${branch?.name ?? "—"} · ${roomName(branch, group.roomId)}`
}
