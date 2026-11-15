"use client"

import { CalendarX2 } from "lucide-react"
import { useState } from "react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { useAttendanceOpen } from "@/hooks/use-attendance-open"
import { canAdminCancel, canTeacherCancel } from "@/lib/session-actions"
import type { StaffWorkspace } from "@/lib/workspace"

import { AttendanceAction } from "./attendance-action"
import { CancelSessionDialog } from "./cancel-session-dialog"
import type { SessionRow } from "./use-session-rows"

/**
 * The action of one row of the sessions page. A lesson that has started:
 * «تسجيل الحضور» / «تعديل الحضور». A lesson not started yet: no waiting
 * attendance button — the ⋮ menu with «إلغاء الحصة» when it may be cancelled
 * (admin: scheduled without attendance; teacher: its supervisor). It switches
 * by itself at the start minute; the API checks everything again.
 */
export function SessionRowActions({
  row,
  workspace = "admin",
  myTeacherId,
}: {
  row: SessionRow
  workspace?: StaffWorkspace
  /** Teacher workspace: the signed-in teacher (only a session's supervisor cancels it) */
  myTeacherId?: string
}) {
  const [cancelling, setCancelling] = useState(false)
  const { open, now } = useAttendanceOpen(row.session)
  if (row.session.status === "CANCELLED") return null
  if (open) return <AttendanceAction row={row} workspace={workspace} />
  const recorded = row.summary.recorded
  const canCancel =
    workspace === "teacher"
      ? canTeacherCancel(row.session, recorded, Boolean(myTeacherId) && row.supervisor?.id === myTeacherId, now)
      : canAdminCancel(row.session, recorded)
  if (!canCancel) return null
  return (
    <>
      <ActionsMenu
        label="إجراءات الحصة"
        actions={[{ label: "إلغاء الحصة", icon: CalendarX2, destructive: true, onSelect: () => setCancelling(true) }]}
      />
      {cancelling && <CancelSessionDialog row={row} workspace={workspace} open onOpenChange={setCancelling} />}
    </>
  )
}
