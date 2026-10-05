import { rosterFor } from "@/lib/attendance"
import { classTeacherIds, indexById } from "@/lib/domain"
import { generateSessions, sessionIdFor } from "@/lib/sessions"
import type { AttendanceStatus, Session, StudentAttendance, TeacherAttendance } from "@/types/domain"

import { groupClasses, groups } from "./groups"
import { ACADEMIC_YEAR, MOCK_TODAY } from "./reference-date"
import { schedules } from "./schedules"
import { students } from "./students"

/** Sessions from the start of the academic year until three weeks after "today". */
const SESSIONS_UNTIL = "2026-10-25"

/** Deterministic 0–1 value from a string, so the seed is identical on server and client. */
function noise(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

function pickStatus(key: string): AttendanceStatus {
  const n = noise(key)
  if (n < 0.82) return "PRESENT"
  if (n < 0.88) return "LATE"
  if (n < 0.94) return "ABSENT"
  return "EXCUSED"
}

const EXCUSE_NOTES = ["مريض", "سفر عائلي", "موعد طبي", "ظرف عائلي"]

/**
 * Hand-picked situations so every screen has something real to show:
 * - cancelled sessions (one past, one upcoming — الفرقان 11 Oct; 18 & 25 Oct stay scheduled)
 * - past sessions whose attendance is missing or partial
 * - today's three sessions in three different states
 */
const CANCELLED: Record<string, string> = {
  [sessionIdFor("ws10", "2026-09-24")]: "مرض المعلمة المشرفة",
  [sessionIdFor("ws1", "2026-10-11")]: "نشاط ثقافي بالمقر الرئيسي",
}
const NOT_RECORDED = new Set([sessionIdFor("ws3", "2026-09-29"), sessionIdFor("ws15", "2026-10-02")])
const PARTIAL = new Set([sessionIdFor("ws11", "2026-09-30"), sessionIdFor("ws13", "2026-10-02")])

const classesById = indexById(groupClasses)

const generated = generateSessions(schedules, { groupClasses, groups }, { from: ACADEMIC_YEAR.start, to: SESSIONS_UNTIL })

export const sessions: Session[] = generated.map((session) => {
  if (CANCELLED[session.id]) {
    return { ...session, status: "CANCELLED", cancellationReason: CANCELLED[session.id] }
  }
  const isPast = session.date <= MOCK_TODAY
  const complete = isPast && !NOT_RECORDED.has(session.id) && !PARTIAL.has(session.id)
  return { ...session, status: complete ? "COMPLETED" : "SCHEDULED" }
})

const recordedSessions = sessions.filter(
  (s) => s.status === "COMPLETED" || PARTIAL.has(s.id)
)

export const studentAttendance: StudentAttendance[] = recordedSessions.flatMap((session) => {
  const roster = rosterFor(session, students)
  // Partial sessions: only the first half of the list was marked
  const marked = PARTIAL.has(session.id) ? roster.slice(0, Math.ceil(roster.length / 2)) : roster
  return marked.map((student) => {
    const status = pickStatus(`${session.id}:${student.id}`)
    const note =
      status === "EXCUSED" ? EXCUSE_NOTES[Math.floor(noise(student.id + session.date) * EXCUSE_NOTES.length)] : undefined
    return { id: `sa-${session.id}-${student.id}`, sessionId: session.id, studentId: student.id, status, note }
  })
})

export const teacherAttendance: TeacherAttendance[] = sessions
  .filter((s) => s.status === "COMPLETED")
  .flatMap((session) => {
    const groupClass = classesById.get(session.groupClassId)
    if (!groupClass) return []
    return classTeacherIds(groupClass).map((teacherId) => {
      const n = noise(`${session.id}:${teacherId}`)
      // Supervisors are almost always there; assistants occasionally miss a session
      const status: AttendanceStatus =
        teacherId === groupClass.supervisorId ? (n < 0.97 ? "PRESENT" : "LATE") : n < 0.88 ? "PRESENT" : n < 0.94 ? "EXCUSED" : "ABSENT"
      return { id: `ta-${session.id}-${teacherId}`, sessionId: session.id, teacherId, status }
    })
  })
