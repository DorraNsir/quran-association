"use client"

import { ClipboardCheck } from "lucide-react"
import Link from "next/link"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { useAttendanceOpen } from "@/hooks/use-attendance-open"
import { formatShortDate } from "@/lib/format"
import { attendanceOpensLabel } from "@/lib/session-actions"
import { workspacePaths, type StaffWorkspace } from "@/lib/workspace"
import type { ISODate } from "@/types/domain"

import type { SessionRow } from "./use-session-rows"

/**
 * "Record attendance" (or "edit" once complete) once the lesson has started
 * (Africa/Tunis — during it or after its end). Before its start: the same
 * action, disabled, saying when it opens; it turns on by itself at the start
 * minute. Nothing for a cancelled lesson. The API enforces the same rule.
 */
export function AttendanceAction({
  row,
  size = "sm",
  workspace = "admin",
}: {
  row: SessionRow
  /** Kept for the callers (the clock now decides, not the date alone) */
  today?: ISODate
  size?: "sm" | "default"
  workspace?: StaffWorkspace
}) {
  const { open, now } = useAttendanceOpen(row.session)
  const hintId = useId()
  if (row.session.status === "CANCELLED") return null
  const done = row.progress.state === "COMPLETE"
  if (!open)
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <Button size={size} variant="outline" disabled aria-describedby={hintId}>
          <ClipboardCheck />
          تسجيل الحضور
        </Button>
        <span id={hintId} className="text-xs text-muted-foreground">
          {attendanceOpensLabel(row.session, formatShortDate, now)}
        </span>
      </span>
    )
  return (
    <Button asChild size={size} variant={done ? "outline" : "default"}>
      <Link href={workspacePaths(workspace).attendance(row.session.id)}>
        <ClipboardCheck />
        {done ? "تعديل الحضور" : "تسجيل الحضور"}
      </Link>
    </Button>
  )
}
