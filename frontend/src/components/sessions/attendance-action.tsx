import { ClipboardCheck } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { canTakeAttendance } from "@/lib/attendance"
import type { ISODate } from "@/types/domain"

import type { SessionRow } from "./use-session-rows"

/** "Record attendance" (or "edit" once complete) — only when attendance can be taken. */
export function AttendanceAction({ row, today, size = "sm" }: { row: SessionRow; today: ISODate; size?: "sm" | "default" }) {
  if (!canTakeAttendance(row.session, today)) return null
  const done = row.progress.state === "COMPLETE"
  return (
    <Button asChild size={size} variant={done ? "outline" : "default"}>
      <Link href={`/admin/sessions/${row.session.id}/attendance`}>
        <ClipboardCheck />
        {done ? "تعديل الحضور" : "تسجيل الحضور"}
      </Link>
    </Button>
  )
}
