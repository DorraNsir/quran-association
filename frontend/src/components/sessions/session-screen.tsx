"use client"

import { CalendarX2 } from "lucide-react"

import { AttendanceTaker } from "@/components/attendance/attendance-taker"
import { EmptyState } from "@/components/shared/empty-state"
import type { Lookups } from "@/lib/domain"
import type { ID, ISODate, Student } from "@/types/domain"

import { SessionDetails } from "./session-details"
import { useSessionRows } from "./use-session-rows"

/** Resolves one live session from the store, then shows its details or the attendance sheet. */
export function SessionScreen({
  sessionId,
  mode,
  lookups,
  students,
  today,
}: {
  sessionId: ID
  mode: "details" | "attendance"
  lookups: Lookups
  students: Student[]
  today: ISODate
}) {
  const row = useSessionRows(lookups, students, today).find((r) => r.session.id === sessionId)
  if (!row) {
    return <EmptyState icon={CalendarX2} title="الحصة غير موجودة" />
  }
  return mode === "details" ? (
    <SessionDetails row={row} today={today} />
  ) : (
    <AttendanceTaker key={row.session.id} row={row} today={today} />
  )
}
