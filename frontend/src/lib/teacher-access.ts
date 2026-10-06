import { teacherAssignments, type Lookups } from "@/lib/domain"
import type { ID, Session, Student, TeacherNote } from "@/types/domain"

/**
 * What a teacher may see, always resolved through GroupClass (supervisor or
 * assistant) — never through Group: two classes of the same group (e.g.
 * مجموعة ماهر in two branches) stay separate.
 *
 * These are UX filters for the mock phase, NOT security: the backend must
 * enforce the same rules on every request.
 */

/** The teacher's classes (supervised first), archived classes excluded. */
export function getTeacherGroupClasses(teacherId: ID, lookups: Lookups) {
  return teacherAssignments(teacherId, lookups).filter((a) => a.groupClass.status !== "ARCHIVED")
}

export function getTeacherClassIds(teacherId: ID, lookups: Lookups) {
  return new Set(getTeacherGroupClasses(teacherId, lookups).map((a) => a.groupClass.id))
}

/** Students of the teacher's classes (archived students excluded). */
export function getTeacherStudents(teacherId: ID, lookups: Lookups, students: Student[]) {
  const classIds = getTeacherClassIds(teacherId, lookups)
  return students.filter((s) => s.status !== "ARCHIVED" && classIds.has(s.groupClassId))
}

/** Sessions of the teacher's classes. */
export function getTeacherSessions<S extends Pick<Session, "groupClassId">>(teacherId: ID, lookups: Lookups, sessions: S[]) {
  const classIds = getTeacherClassIds(teacherId, lookups)
  return sessions.filter((s) => classIds.has(s.groupClassId))
}

export function canTeacherAccessClass(teacherId: ID, groupClassId: ID, lookups: Lookups) {
  return getTeacherClassIds(teacherId, lookups).has(groupClassId)
}

export function canTeacherAccessStudent(teacherId: ID, student: Pick<Student, "groupClassId" | "status">, lookups: Lookups) {
  return student.status !== "ARCHIVED" && canTeacherAccessClass(teacherId, student.groupClassId, lookups)
}

export function canTeacherAccessSession(teacherId: ID, session: Pick<Session, "groupClassId">, lookups: Lookups) {
  return canTeacherAccessClass(teacherId, session.groupClassId, lookups)
}

/** A teacher only ever sees their own private notes. */
export function getTeacherNotes(teacherId: ID, notes: TeacherNote[]) {
  return notes.filter((n) => n.teacherId === teacherId)
}
