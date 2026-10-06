import { useSyncExternalStore } from "react"

import { upsertMemorization, type MemorizationUpdate } from "@/lib/memorization"
import { memorizationProgress } from "@/lib/mock/memorization"
import { newMockId } from "@/lib/mock/reference-date"
import { sessions, studentAttendance, teacherAttendance } from "@/lib/mock/sessions"
import type {
  AttendanceStatus,
  ID,
  MemorizationProgress,
  Session,
  SessionStatus,
  StudentAttendance,
  TeacherAttendance,
} from "@/types/domain"

/**
 * In-memory mock store for operational data (sessions, attendance and
 * memorization tracking).
 *
 * Saving attendance on one screen must show up on the session page, the
 * student history and the dashboard, so this state is shared by every
 * client component and kept across client-side navigation (a full reload
 * resets it to the seed). It stands in for API queries/mutations: replace
 * `useOperations` and `operations.*` with fetch hooks when NestJS exists.
 */
export interface OperationsState {
  sessions: Session[]
  studentAttendance: StudentAttendance[]
  teacherAttendance: TeacherAttendance[]
  /** One last-memorized-surah per (student, academic year, semester) */
  memorizationProgress: MemorizationProgress[]
}

const seed: OperationsState = { sessions, studentAttendance, teacherAttendance, memorizationProgress }
let state = seed
const listeners = new Set<() => void>()

function setState(next: OperationsState) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Server and first client render both use the seed, so hydration always matches. */
export function useOperations() {
  return useSyncExternalStore(subscribe, () => state, () => seed)
}

export interface AttendanceEntry {
  status: AttendanceStatus
  note?: string
}

export const operations = {
  /**
   * Replaces a session's attendance. `complete` marks the session as held
   * (COMPLETED); an incomplete save keeps it SCHEDULED so it stays pending.
   */
  saveAttendance(
    sessionId: ID,
    students: Map<ID, AttendanceEntry>,
    teachers: Map<ID, AttendanceEntry>,
    { complete }: { complete: boolean }
  ) {
    const existing = new Map(
      state.studentAttendance.filter((r) => r.sessionId === sessionId).map((r) => [r.studentId, r.id])
    )
    const existingTeachers = new Map(
      state.teacherAttendance.filter((r) => r.sessionId === sessionId).map((r) => [r.teacherId, r.id])
    )
    setState({
      ...state,
      sessions: state.sessions.map((s) =>
        s.id === sessionId && complete && s.status !== "CANCELLED" ? { ...s, status: "COMPLETED" } : s
      ),
      studentAttendance: [
        ...state.studentAttendance.filter((r) => r.sessionId !== sessionId),
        ...[...students].map(([studentId, entry]) => ({
          id: existing.get(studentId) ?? newMockId("sa"),
          sessionId,
          studentId,
          status: entry.status,
          note: entry.note?.trim() || undefined,
        })),
      ],
      teacherAttendance: [
        ...state.teacherAttendance.filter((r) => r.sessionId !== sessionId),
        ...[...teachers].map(([teacherId, entry]) => ({
          id: existingTeachers.get(teacherId) ?? newMockId("ta"),
          sessionId,
          teacherId,
          status: entry.status,
          note: entry.note?.trim() || undefined,
        })),
      ],
    })
  },

  /** Sets the student's last memorized surah for one semester (update or create — never a new event). */
  saveMemorization(update: MemorizationUpdate) {
    setState({
      ...state,
      memorizationProgress: upsertMemorization(state.memorizationProgress, update, () => newMockId("mp")),
    })
  },

  /** Cancelling affects only this dated session — the weekly schedule is untouched. */
  setSessionStatus(sessionId: ID, status: SessionStatus, cancellationReason?: string) {
    setState({
      ...state,
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, status, cancellationReason: status === "CANCELLED" ? cancellationReason?.trim() || undefined : undefined }
          : s
      ),
    })
  },
}
