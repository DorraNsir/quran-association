"use client"

import { useQuery } from "@tanstack/react-query"

import type { Lookups } from "@/lib/domain"
import type { Branch, Gender, Group, GroupClass, ISODate, RecordStatus, Room, Student, Teacher, Weekday, WeeklySchedule } from "@/types/domain"

import { api } from "./client"

type ActivationStatus = "ACTIVE" | "INACTIVE"

/* ------------------------------ API DTOs (flat) ------------------------------ */

interface WsTeacher {
  id: string
  firstName: string
  lastName: string
  gender: Gender | null
  photoUrl: string | null
  status: ActivationStatus
  joinedAt: ISODate
}
interface WsStudent {
  id: string
  firstName: string
  lastName: string
  gender: Gender | null
  dateOfBirth: ISODate | null
  phone: string | null
  guardianPhone: string | null
  photoUrl: string | null
  registrationDate: ISODate
  groupClassId: string | null
  status: RecordStatus
}
interface WsBundle {
  branches: { id: string; name: string; address: string; phone: string | null; status: ActivationStatus }[]
  rooms: { id: string; branchId: string; name: string; status: ActivationStatus }[]
  groups: { id: string; name: string; audience: string | null; status: RecordStatus; createdAt: ISODate }[]
  groupClasses: { id: string; groupId: string; branchId: string; supervisorId: string; assistantIds: string[]; status: RecordStatus }[]
  teachers: WsTeacher[]
  schedules: { id: string; groupClassId: string; dayOfWeek: Weekday; startTime: string; endTime: string; roomId: string }[]
}
interface TeacherWorkspaceDto extends WsBundle {
  teacher: WsTeacher
  students: WsStudent[]
}
interface StudentWorkspaceDto extends WsBundle {
  student: WsStudent & { address: string | null; email: string | null; cin: string | null }
}

/* ------------------------------ adapters ------------------------------ */

const toTeacher = (t: WsTeacher): Teacher => ({
  id: t.id,
  firstName: t.firstName,
  lastName: t.lastName,
  gender: t.gender ?? "MALE",
  phone: "",
  photoUrl: t.photoUrl ?? undefined,
  status: t.status,
  joinedAt: t.joinedAt,
})

const toStudent = (s: WsStudent & { address?: string | null; cin?: string | null }): Student => ({
  id: s.id,
  firstName: s.firstName,
  lastName: s.lastName,
  gender: s.gender ?? "MALE",
  dateOfBirth: s.dateOfBirth ?? "",
  phone: s.phone ?? undefined,
  guardianPhone: s.guardianPhone ?? undefined,
  cin: s.cin ?? undefined,
  address: s.address ?? "",
  photoUrl: s.photoUrl ?? undefined,
  registrationDate: s.registrationDate,
  groupClassId: s.groupClassId ?? "",
  status: s.status,
})

function toLookups(b: WsBundle): Lookups {
  return {
    branches: b.branches.map((x): Branch => ({ ...x, phone: x.phone ?? undefined })),
    rooms: b.rooms as Room[],
    groups: b.groups.map((g): Group => ({ ...g, audience: g.audience ?? "" })),
    groupClasses: b.groupClasses as GroupClass[],
    teachers: b.teachers.map(toTeacher),
    schedules: b.schedules.map((x): WeeklySchedule => ({ id: x.id, groupClassId: x.groupClassId, day: x.dayOfWeek, start: x.startTime, end: x.endTime, roomId: x.roomId })),
  }
}

export const workspaceKeys = {
  teacher: ["teacher-workspace"] as const,
  student: ["student-workspace"] as const,
}

/** The signed-in teacher's classes and their reference data (GET /api/teacher/workspace). */
export function useTeacherWorkspace() {
  return useQuery({
    queryKey: workspaceKeys.teacher,
    queryFn: ({ signal }) => api<TeacherWorkspaceDto>("/teacher/workspace", { signal }),
    select: (w) => ({ teacher: toTeacher(w.teacher), lookups: toLookups(w), students: w.students.map(toStudent) }),
  })
}

/** The signed-in student's profile and current class (GET /api/student/workspace). */
export function useStudentWorkspace() {
  return useQuery({
    queryKey: workspaceKeys.student,
    queryFn: ({ signal }) => api<StudentWorkspaceDto>("/student/workspace", { signal }),
    select: (w) => ({ student: toStudent(w.student), email: w.student.email ?? undefined, lookups: toLookups(w) }),
  })
}

export type TeacherWorkspace = NonNullable<ReturnType<typeof useTeacherWorkspace>["data"]>
export type StudentWorkspace = NonNullable<ReturnType<typeof useStudentWorkspace>["data"]>
