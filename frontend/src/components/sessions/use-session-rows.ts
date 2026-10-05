import {
  indexBySession,
  rosterFor,
  sessionProgress,
  summarize,
  type AttendanceSummary,
  type SessionProgress,
} from "@/lib/attendance"
import { groupTeachers, indexLookups, type Lookups } from "@/lib/domain"
import { useOperations, type OperationsState } from "@/lib/store/operations"
import type {
  Branch,
  Group,
  ISODate,
  Room,
  Session,
  Student,
  StudentAttendance,
  Teacher,
  TeacherAttendance,
} from "@/types/domain"

/** A session with everything a screen needs, resolved once from ids. */
export interface SessionRow {
  session: Session
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
  const { branchesById, roomsById, groupsById, teachersById } = indexLookups(lookups)
  const recordsBySession = indexBySession(state.studentAttendance)
  const teacherRecordsBySession = indexBySession(state.teacherAttendance)

  return state.sessions.map((session) => {
    const group = groupsById.get(session.groupId)
    const team = group ? groupTeachers(group, teachersById) : { supervisor: undefined, assistants: [] }
    const roster = rosterFor(session, students)
    const records = recordsBySession.get(session.id) ?? []
    return {
      session,
      group,
      branch: branchesById.get(session.branchId),
      room: roomsById.get(session.roomId),
      supervisor: team.supervisor,
      assistants: team.assistants,
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
