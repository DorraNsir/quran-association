import { WEEK_ORDER } from "@/lib/i18n"
import { minutesBetween } from "@/lib/format"
import type {
  Branch,
  Group,
  GroupClass,
  ID,
  ISODate,
  Room,
  ScheduleSlot,
  Student,
  Teacher,
  TeachingRole,
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

export { weekdayOf } from "@/lib/dates"

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

/** A class's weekly slots, in week order. */
export function schedulesOf(groupClassId: ID, schedules: WeeklySchedule[]) {
  return sortSlots(schedules.filter((s) => s.groupClassId === groupClassId))
}

/** The classes of a pedagogical group. */
export function classesOf(groupId: ID, groupClasses: GroupClass[]) {
  return groupClasses.filter((c) => c.groupId === groupId)
}

/** Supervisor + assistants: everyone who must be free when the class meets. */
export function classTeacherIds(groupClass: Pick<GroupClass, "supervisorId" | "assistantIds">) {
  return [groupClass.supervisorId, ...groupClass.assistantIds.filter((id) => id !== groupClass.supervisorId)]
}

export function teachingRoleIn(groupClass: GroupClass, teacherId: ID): TeachingRole | null {
  if (groupClass.supervisorId === teacherId) return "SUPERVISOR"
  if (groupClass.assistantIds.includes(teacherId)) return "ASSISTANT"
  return null
}

export function classTeachers(groupClass: GroupClass, teachersById: Map<ID, Teacher>) {
  return {
    supervisor: teachersById.get(groupClass.supervisorId),
    assistants: groupClass.assistantIds
      .map((id) => teachersById.get(id))
      .filter((t): t is Teacher => Boolean(t)),
  }
}

/** A class is running when both it and its pedagogical group are active. */
export function isRunning(groupClass: GroupClass | undefined, groupsById: Map<ID, Group>) {
  return groupClass?.status === "ACTIVE" && groupsById.get(groupClass.groupId)?.status === "ACTIVE"
}

/** Reference data most admin screens need to resolve ids into names. */
export interface Lookups {
  branches: Branch[]
  rooms: Room[]
  groups: Group[]
  groupClasses: GroupClass[]
  teachers: Teacher[]
  schedules: WeeklySchedule[]
}

export function indexLookups({ branches, rooms, groups, groupClasses, teachers, schedules }: Lookups) {
  const roomsById = indexById(rooms)
  // Rooms are chosen per weekly slot: a class uses the distinct rooms of its slots (in slot order)
  const roomsByClass = new Map<ID, Room[]>()
  for (const slot of sortSlots(schedules)) {
    const room = roomsById.get(slot.roomId)
    if (!room) continue
    const list = roomsByClass.get(slot.groupClassId) ?? []
    if (!list.some((r) => r.id === room.id)) list.push(room)
    roomsByClass.set(slot.groupClassId, list)
  }
  return {
    branchesById: indexById(branches),
    roomsById,
    groupsById: indexById(groups),
    classesById: indexById(groupClasses),
    teachersById: indexById(teachers),
    roomsByClass,
  }
}

type Indexes = ReturnType<typeof indexLookups>

/** Everything that identifies one class: same group name, but its own place and team. */
export interface ClassView {
  groupClass: GroupClass
  group?: Group
  branch?: Branch
  /** Distinct rooms of its weekly slots (each slot has its own room) */
  rooms: Room[]
  supervisor?: Teacher
  assistants: Teacher[]
}

export function describeClass(groupClass: GroupClass, indexes: Indexes): ClassView {
  return {
    groupClass,
    group: indexes.groupsById.get(groupClass.groupId),
    branch: indexes.branchesById.get(groupClass.branchId),
    rooms: indexes.roomsByClass.get(groupClass.id) ?? [],
    ...classTeachers(groupClass, indexes.teachersById),
  }
}

/** "القاعة 1، القاعة 3" — the rooms a class uses ("—" before any weekly slot). */
export function roomsLabel(rooms: Pick<Room, "name">[]) {
  return rooms.length ? rooms.map((r) => r.name).join("، ") : "—"
}

/** The class view of a student's current class (Student → GroupClass → Group, supervisor…). */
export function studentClass(student: Pick<Student, "groupClassId">, indexes: Indexes) {
  const groupClass = indexes.classesById.get(student.groupClassId)
  return groupClass ? describeClass(groupClass, indexes) : undefined
}

export interface TeacherAssignment extends ClassView {
  role: TeachingRole
}

/** Classes a teacher works in, supervisor assignments first. */
export function teacherAssignments(teacherId: ID, lookups: Lookups): TeacherAssignment[] {
  const indexes = indexLookups(lookups)
  return lookups.groupClasses
    .flatMap((groupClass) => {
      const role = teachingRoleIn(groupClass, teacherId)
      return role ? [{ ...describeClass(groupClass, indexes), role }] : []
    })
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "SUPERVISOR" ? -1 : 1))
}

/** A teacher's weekly slots across all their running classes, for previews and workload. */
export function teacherWeeklySlots(teacherId: ID, lookups: Lookups) {
  const { groupsById, roomsById } = indexLookups(lookups)
  return teacherAssignments(teacherId, lookups)
    .filter((a) => isRunning(a.groupClass, groupsById))
    .flatMap((assignment) =>
      schedulesOf(assignment.groupClass.id, lookups.schedules).map((slot) => ({
        slot,
        ...assignment,
        // The room of THIS slot (a class may meet in different rooms)
        room: roomsById.get(slot.roomId),
      }))
    )
}

export function studentsInClass(groupClassId: ID, students: Student[]) {
  return students.filter((s) => s.groupClassId === groupClassId)
}

/** All students of a pedagogical group, across its classes. */
export function studentsInGroup(groupId: ID, students: Student[], groupClasses: GroupClass[]) {
  const classIds = new Set(classesOf(groupId, groupClasses).map((c) => c.id))
  return students.filter((s) => classIds.has(s.groupClassId))
}

export function countActiveStudentsByClass(students: Student[]) {
  const counts = new Map<ID, number>()
  for (const s of students) {
    if (s.status !== "ACTIVE") continue
    counts.set(s.groupClassId, (counts.get(s.groupClassId) ?? 0) + 1)
  }
  return counts
}

export function countActiveStudentsByGroup(students: Student[], classesById: Map<ID, GroupClass>) {
  const counts = new Map<ID, number>()
  for (const [classId, n] of countActiveStudentsByClass(students)) {
    const groupId = classesById.get(classId)?.groupId
    if (groupId) counts.set(groupId, (counts.get(groupId) ?? 0) + n)
  }
  return counts
}

/** Weekly slots of running classes held in a room/branch — what "using a room" means. */
export function activeSchedulesIn(where: { roomId?: ID; branchId?: ID }, lookups: Lookups) {
  const { classesById, groupsById } = indexLookups(lookups)
  return lookups.schedules.filter((s) => {
    const groupClass = classesById.get(s.groupClassId)
    return (
      isRunning(groupClass, groupsById) &&
      (where.roomId === undefined || s.roomId === where.roomId) &&
      (where.branchId === undefined || groupClass?.branchId === where.branchId)
    )
  })
}

export function branchStats(branchId: ID, lookups: Lookups) {
  const { groupsById } = indexLookups(lookups)
  const branchRooms = roomsOfBranch(branchId, lookups.rooms)
  const runningClasses = lookups.groupClasses.filter(
    (c) => c.branchId === branchId && isRunning(c, groupsById)
  )
  const schedules = activeSchedulesIn({ branchId }, lookups)
  return {
    rooms: branchRooms.length,
    activeRooms: branchRooms.filter((r) => r.status === "ACTIVE").length,
    activeClasses: runningClasses.length,
    weeklySessions: schedules.length,
    weeklyMinutes: weeklyMinutes(schedules),
  }
}
