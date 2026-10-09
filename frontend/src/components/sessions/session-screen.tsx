"use client"

import { AttendanceTaker } from "@/components/attendance/attendance-taker"
import { NotFoundState } from "@/components/shared/not-found-state"
import { QueryState } from "@/components/shared/query-state"
import { ApiError } from "@/lib/api/errors"
import { toSessionRow, useSession, useSessionRoster } from "@/lib/api/sessions"
import { todayInTunis } from "@/lib/dates"
import { workspacePaths, type StaffWorkspace } from "@/lib/workspace"
import type { ID } from "@/types/domain"

import { SessionDetails } from "./session-details"

/**
 * One session from the API (admin endpoint, or the teacher endpoint that
 * checks the session's team), with its roster on the session date — then
 * its details or the attendance sheet.
 */
export function SessionScreen({ sessionId, mode, workspace = "admin" }: { sessionId: ID; mode: "details" | "attendance"; workspace?: StaffWorkspace }) {
  const today = todayInTunis()
  const session = useSession(workspace, sessionId)
  const roster = useSessionRoster(workspace, sessionId, session.isSuccess)
  if (session.error instanceof ApiError && (session.error.isNotFound || session.error.status === 400))
    return <NotFoundState title="الحصة غير موجودة" backHref={workspacePaths(workspace).sessions} backLabel="العودة إلى الحصص" />
  if (!session.data || !roster.data) return <QueryState query={[session, roster]}>{null}</QueryState>
  const row = toSessionRow(session.data, today)
  return mode === "details" ? (
    <SessionDetails row={row} roster={roster.data} today={today} workspace={workspace} />
  ) : (
    <AttendanceTaker key={`${row.session.id}-${roster.dataUpdatedAt}`} row={row} roster={roster.data} workspace={workspace} />
  )
}
