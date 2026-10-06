import { describeClass, indexLookups, studentClass, type Lookups } from "@/lib/domain"
import { getMemorizationProgress } from "@/lib/memorization"
import type { ID, MemorizationProgress, Semester, Session, Student, StudentAttendance } from "@/types/domain"

/**
 * What a student may see: their own class, sessions, attendance and
 * memorization — resolved Student → GroupClass, never by Group alone
 * (two classes of مجموعة ماهر have different branches and supervisors).
 *
 * PRIVACY: nothing here reads TeacherNote. Student Space must only get its
 * data through these selectors. They are UX filters for the mock phase;
 * the API must enforce "own data only" on every request.
 */

/** The student's class with its group, branch, room and teachers (undefined if unassigned). */
export function getStudentGroupClass(student: Pick<Student, "groupClassId">, lookups: Lookups) {
  return studentClass(student, indexLookups(lookups))
}

/** Dated sessions of the student's own class, in date then time order. */
export function getStudentSessions<S extends Session>(student: Pick<Student, "groupClassId">, sessions: S[]) {
  return sessions
    .filter((s) => s.groupClassId === student.groupClassId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
}

export interface StudentAttendanceEntry {
  record: StudentAttendance
  session: Session
  /** The class the session belonged to (group / branch) */
  groupName?: string
  branchName?: string
}

/** The student's own attendance records, most recent first, each with its session. */
export function getStudentAttendance(
  studentId: ID,
  state: { sessions: Session[]; studentAttendance: StudentAttendance[] },
  lookups: Lookups
): StudentAttendanceEntry[] {
  const indexes = indexLookups(lookups)
  const sessionsById = new Map(state.sessions.map((s) => [s.id, s]))
  return state.studentAttendance
    .filter((r) => r.studentId === studentId)
    .flatMap((record) => {
      const session = sessionsById.get(record.sessionId)
      if (!session) return []
      const groupClass = indexes.classesById.get(session.groupClassId)
      const view = groupClass ? describeClass(groupClass, indexes) : undefined
      return [{ record, session, groupName: view?.group?.name, branchName: view?.branch?.name }]
    })
    .sort((a, b) => b.session.date.localeCompare(a.session.date) || b.session.start.localeCompare(a.session.start))
}

/** The student's last memorized surah for one academic year and semester. */
export function getStudentMemorization(
  records: MemorizationProgress[],
  studentId: ID,
  academicYearId: ID,
  semester: Semester
) {
  return getMemorizationProgress(records, studentId, academicYearId, semester)
}
