import {
  indexBySession,
  rosterFor,
  sessionProgress,
  summarize,
  type AttendanceSummary,
  type SessionProgress,
} from "@/lib/attendance"
import { describeClass, indexLookups, type Lookups } from "@/lib/domain"
import { useOperations, type OperationsState } from "@/lib/store/operations"
import type {
  Branch,
  Group,
  GroupClass,
  ISODate,
  Room,
  Session,
  Student,
  StudentAttendance,
  Teacher,
  TeacherAttendance,
} from "@/types/domain"

/**
 * A session with everything a screen needs, resolved once from ids:
 * Session → GroupClass → group, branch, room, teachers, roster.
 */
export interface SessionRow {
  session: Session
  groupClass?: GroupClass
  group?: Group
  branch?: Branch
  room?: Room
  supervisor?: Teacher
  assistants: Teacher[]
  roster: Student[]
  records: StudentAttendance[]
  teacherRecords: TeacherAttendance[]
  progress: SessionProgress
  summary: AttendanceSummary
}

export function buildSessionRows(
  state: OperationsState,
  lookups: Lookups,
  students: Student[],
  today: ISODate
): SessionRow[] {
  const indexes = indexLookups(lookups)
  const recordsBySession = indexBySession(state.studentAttendance)
  const teacherRecordsBySession = indexBySession(state.teacherAttendance)

  return state.sessions.map((session) => {
    const groupClass = indexes.classesById.get(session.groupClassId)
    const view = groupClass ? describeClass(groupClass, indexes) : undefined
    // Only the students of THIS class — never the other classes of the same group
    const roster = rosterFor(session, students)
    const records = recordsBySession.get(session.id) ?? []
    return {
      session,
      groupClass,
      group: view?.group,
      branch: view?.branch,
      room: view?.room,
      supervisor: view?.supervisor,
      assistants: view?.assistants ?? [],
      roster,
      records,
      teacherRecords: teacherRecordsBySession.get(session.id) ?? [],
      progress: sessionProgress(session, roster.length, records.length, today),
      summary: summarize(records),
    }
  })
}

/** Live session rows from the shared store, in date then time order. */
export function useSessionRows(lookups: Lookups, students: Student[], today: ISODate) {
  const state = useOperations()
  return buildSessionRows(state, lookups, students, today).sort(
    (a, b) => a.session.date.localeCompare(b.session.date) || a.session.start.localeCompare(b.session.start)
  )
}
