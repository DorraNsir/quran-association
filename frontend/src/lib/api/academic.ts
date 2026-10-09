"use client"

import { useMutation, useQueries, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"

import type { Lookups } from "@/lib/domain"
import type {
  AcademicYear,
  Branch,
  Gender,
  Group,
  GroupClass,
  RecordStatus,
  Room,
  Student,
  Teacher,
  Weekday,
  WeeklySchedule,
} from "@/types/domain"

import { api, fetchAll, type Query } from "./client"

/* ------------------------------ API DTOs ------------------------------ */

type ActivationStatus = "ACTIVE" | "INACTIVE"
export interface Ref {
  id: string
  name: string
}
export interface AccountSummary {
  id: string
  username: string
  isActive: boolean
  roles: ("ADMIN" | "TEACHER" | "STUDENT")[]
}
export interface BranchDto {
  id: string
  name: string
  address: string
  phone: string | null
  status: ActivationStatus
  roomsCount: number
  activeRoomsCount: number
  activeClassesCount: number
}
export interface RoomDto {
  id: string
  name: string
  status: ActivationStatus
  branch: Ref & { status: ActivationStatus }
  activeClassesCount: number
}
export interface GroupDto {
  id: string
  name: string
  audience: string | null
  status: RecordStatus
  createdAt: string
  classesCount: number
  activeClassesCount: number
  activeStudentsCount: number
}
export interface TeacherRef {
  id: string
  firstName: string
  lastName: string
  photoUrl: string | null
  status: string
}
export interface GroupClassDto {
  id: string
  status: RecordStatus
  group: Ref
  branch: Ref
  rooms: Ref[]
  supervisor: TeacherRef
  assistants: TeacherRef[]
  activeStudentsCount: number
}
export interface PersonView {
  id: string
  firstName: string
  lastName: string
  gender: Gender | null
  dateOfBirth?: string | null
  phone: string | null
  email: string | null
  address: string | null
  photoUrl: string | null
}
export interface TeacherDto {
  id: string
  status: ActivationStatus
  joinedAt: string
  qualification: string | null
  person: PersonView
  account: AccountSummary | null
  supervisedClassesCount: number
  assistedClassesCount: number
}
export interface ClassRef {
  id: string
  status: RecordStatus
  group: Ref
  branch: Ref
  room: Ref
}
export interface TeacherDetailDto extends TeacherDto {
  supervisedClasses: ClassRef[]
  assistedClasses: ClassRef[]
}
export interface StudentDto {
  id: string
  status: RecordStatus
  registrationDate: string
  guardianPhone: string | null
  cin: string | null
  person: PersonView
  groupClass: (ClassRef & { supervisor: { id: string; firstName: string; lastName: string } }) | null
  account: AccountSummary | null
}
export interface ScheduleDto {
  id: string
  dayOfWeek: Weekday
  startTime: string
  endTime: string
  groupClass: { id: string }
  room: Ref
}
export interface AcademicYearDto {
  id: string
  label: string
  startDate: string
  endDate: string
  semester2StartDate: string
  isCurrent: boolean
  firstSemester: { startDate: string; endDate: string }
  secondSemester: { startDate: string; endDate: string }
}
export interface EnrollmentDto {
  id: string
  startDate: string
  endDate: string | null
  groupClass: ClassRef
}

/* ------------------------------ adapters ------------------------------ */

export const toBranch = (b: BranchDto): Branch => ({
  id: b.id,
  name: b.name,
  address: b.address,
  phone: b.phone ?? undefined,
  status: b.status,
})
export const toRoom = (r: RoomDto): Room => ({ id: r.id, branchId: r.branch.id, name: r.name, status: r.status })
export const toGroup = (g: GroupDto): Group => ({
  id: g.id,
  name: g.name,
  audience: g.audience ?? "",
  status: g.status,
  createdAt: g.createdAt.slice(0, 10),
})
export const toGroupClass = (c: GroupClassDto): GroupClass => ({
  id: c.id,
  groupId: c.group.id,
  branchId: c.branch.id,
  supervisorId: c.supervisor.id,
  assistantIds: c.assistants.map((a) => a.id),
  status: c.status,
})
export const toTeacher = (t: TeacherDto): Teacher => ({
  id: t.id,
  userId: t.account?.id,
  firstName: t.person.firstName,
  lastName: t.person.lastName,
  gender: t.person.gender ?? "MALE",
  phone: t.person.phone ?? "",
  email: t.person.email ?? undefined,
  photoUrl: t.person.photoUrl ?? undefined,
  status: t.status,
  joinedAt: t.joinedAt,
  qualification: t.qualification ?? undefined,
})
export const toStudent = (s: StudentDto): Student => ({
  id: s.id,
  firstName: s.person.firstName,
  lastName: s.person.lastName,
  gender: s.person.gender ?? "MALE",
  dateOfBirth: s.person.dateOfBirth ?? "",
  phone: s.person.phone ?? undefined,
  guardianPhone: s.guardianPhone ?? undefined,
  cin: s.cin ?? undefined,
  address: s.person.address ?? "",
  photoUrl: s.person.photoUrl ?? undefined,
  registrationDate: s.registrationDate,
  groupClassId: s.groupClass?.id ?? "",
  status: s.status,
})
export const toSchedule = (s: ScheduleDto): WeeklySchedule => ({
  id: s.id,
  groupClassId: s.groupClass.id,
  day: s.dayOfWeek,
  start: s.startTime,
  end: s.endTime,
  roomId: s.room.id,
})
export const toAcademicYear = (y: AcademicYearDto): AcademicYear => ({
  id: y.id,
  label: y.label,
  startDate: y.startDate,
  endDate: y.endDate,
  isCurrent: y.isCurrent,
  semesters: { SEMESTER_1: y.firstSemester, SEMESTER_2: y.secondSemester },
})

/* ------------------------------ queries ------------------------------ */

/** Stable cache keys: one place per server collection (no competing caches). */
export const keys = {
  branches: ["branches"] as const,
  rooms: ["rooms"] as const,
  groups: ["groups"] as const,
  groupClasses: ["group-classes"] as const,
  teachers: ["teachers"] as const,
  students: ["students"] as const,
  schedules: ["schedules"] as const,
  academicYears: ["academic-years"] as const,
  sessions: ["sessions"] as const,
}

const all = <T, R>(key: QueryKey, path: string, adapt: (dto: T) => R, query: Query = {}) => ({
  queryKey: [...key, "all", query],
  queryFn: async ({ signal }: { signal: AbortSignal }) => (await fetchAll<T>(path, query, signal)).map(adapt),
})

export const queries = {
  branches: () => all(keys.branches, "/admin/branches", toBranch),
  rooms: () => all(keys.rooms, "/admin/rooms", toRoom),
  groups: () => all(keys.groups, "/admin/groups", toGroup),
  groupClasses: () => all(keys.groupClasses, "/admin/group-classes", toGroupClass),
  teachers: () => all(keys.teachers, "/admin/teachers", toTeacher),
  students: () => all(keys.students, "/admin/students", toStudent),
  // Weekly slots: one bounded list, not paginated (the API rejects page/pageSize here)
  schedules: () => ({
    queryKey: [...keys.schedules, "all", {}],
    queryFn: async ({ signal }: { signal: AbortSignal }) => (await api<ScheduleDto[]>("/admin/schedules", { signal })).map(toSchedule),
  }),
}

export const useBranches = () => useQuery(queries.branches())
export const useRooms = () => useQuery(queries.rooms())
export const useGroups = () => useQuery(queries.groups())
export const useGroupClasses = () => useQuery(queries.groupClasses())
export const useTeachers = () => useQuery(queries.teachers())
export const useStudents = () => useQuery(queries.students())
export const useSchedules = () => useQuery(queries.schedules())

/** Raw DTO lists (counts computed by the API) for list pages. */
export const useBranchDtos = () =>
  useQuery({ queryKey: [...keys.branches, "dtos"], queryFn: ({ signal }) => fetchAll<BranchDto>("/admin/branches", {}, signal) })
export const useGroupDtos = () =>
  useQuery({ queryKey: [...keys.groups, "dtos"], queryFn: ({ signal }) => fetchAll<GroupDto>("/admin/groups", {}, signal) })
export const useTeacherDtos = () =>
  useQuery({ queryKey: [...keys.teachers, "dtos"], queryFn: ({ signal }) => fetchAll<TeacherDto>("/admin/teachers", {}, signal) })
export const useStudentDtos = () =>
  useQuery({ queryKey: [...keys.students, "dtos"], queryFn: ({ signal }) => fetchAll<StudentDto>("/admin/students", {}, signal) })

export function useAcademicYears() {
  return useQuery({
    queryKey: [...keys.academicYears, "all"],
    queryFn: async ({ signal }) =>
      (await api<AcademicYearDto[]>("/admin/academic-years", { signal })).map(toAcademicYear),
  })
}

/**
 * The admin reference bundle (branches, rooms, groups, classes, teachers,
 * weekly slots) every admin screen resolves ids against — the same shape
 * the views always used, now from the API.
 */
export function useLookups() {
  const results = useQueries({
    queries: [
      queries.branches(),
      queries.rooms(),
      queries.groups(),
      queries.groupClasses(),
      queries.teachers(),
      queries.schedules(),
    ],
  })
  const [branches, rooms, groups, groupClasses, teachers, schedules] = results
  const lookups: Lookups | undefined =
    branches.data && rooms.data && groups.data && groupClasses.data && teachers.data && schedules.data
      ? {
          branches: branches.data as Branch[],
          rooms: rooms.data as Room[],
          groups: groups.data as Group[],
          groupClasses: groupClasses.data as GroupClass[],
          teachers: teachers.data as Teacher[],
          schedules: schedules.data as WeeklySchedule[],
        }
      : undefined
  return { lookups, results }
}

/* ------------------------------ mutations ------------------------------ */

/**
 * A mutation that invalidates the given collections on success (so every
 * screen showing them refreshes from the API).
 */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  invalidate: readonly (readonly unknown[])[]
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
  })
}

export { api }
