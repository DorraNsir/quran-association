import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  Check,
  CircleDashed,
  CircleDotDashed,
  Clock,
  FileCheck2,
  X,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { AttendanceState } from "@/lib/attendance"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AttendanceStatus, SessionStatus } from "@/types/domain"

/**
 * One visual language per attendance status — icon + text + color, so the
 * status never depends on color alone. Buttons and badges share it.
 */
export const ATTENDANCE_STYLE: Record<
  AttendanceStatus,
  { icon: LucideIcon; badge: string; selected: string; idle: string }
> = {
  PRESENT: {
    icon: Check,
    badge: "bg-brand-soft text-brand-soft-foreground",
    selected: "border-primary bg-primary text-primary-foreground",
    idle: "hover:border-primary/50 hover:bg-brand-soft/60",
  },
  ABSENT: {
    icon: X,
    badge: "bg-destructive/10 text-destructive",
    selected: "border-destructive bg-destructive text-white",
    idle: "hover:border-destructive/50 hover:bg-destructive/10",
  },
  EXCUSED: {
    icon: FileCheck2,
    badge: "bg-sky-50 text-sky-800",
    selected: "border-sky-700 bg-sky-700 text-white",
    idle: "hover:border-sky-600/50 hover:bg-sky-50",
  },
  LATE: {
    icon: Clock,
    badge: "bg-warning-soft text-warning",
    selected: "border-amber-600 bg-amber-600 text-white",
    idle: "hover:border-amber-500/60 hover:bg-warning-soft",
  },
}

export function AttendanceStatusBadge({ status, className }: { status: AttendanceStatus; className?: string }) {
  const { icon: Icon, badge } = ATTENDANCE_STYLE[status]
  return (
    <Badge className={cn("gap-1", badge, className)}>
      <Icon aria-hidden />
      {labels.attendance[status]}
    </Badge>
  )
}

const SESSION_STYLE: Record<SessionStatus, { icon: LucideIcon; className: string }> = {
  SCHEDULED: { icon: CalendarClock, className: "bg-muted text-foreground" },
  COMPLETED: { icon: CalendarCheck2, className: "bg-brand-soft text-brand-soft-foreground" },
  CANCELLED: { icon: CalendarX2, className: "bg-destructive/10 text-destructive" },
}

export function SessionStatusBadge({ status, className }: { status: SessionStatus; className?: string }) {
  const { icon: Icon, className: style } = SESSION_STYLE[status]
  return (
    <Badge className={cn("gap-1", style, className)}>
      <Icon aria-hidden />
      {labels.sessionStatus[status]}
    </Badge>
  )
}

const STATE_STYLE: Record<AttendanceState, { label: string; icon: LucideIcon; className: string }> = {
  COMPLETE: { label: "الحضور مكتمل", icon: Check, className: "text-primary" },
  PARTIAL: { label: "تسجيل جزئي", icon: CircleDotDashed, className: "text-warning" },
  NOT_RECORDED: { label: "لم يُسجَّل الحضور", icon: CircleDashed, className: "text-destructive" },
  UPCOMING: { label: "لم تبدأ بعد", icon: CalendarClock, className: "text-muted-foreground" },
  CANCELLED: { label: "حصة ملغاة", icon: CalendarX2, className: "text-muted-foreground" },
}

/** "Attendance completed / partial 3/6 / not recorded / upcoming / cancelled". */
export function AttendanceStateLabel({
  state,
  recorded,
  expected,
  className,
}: {
  state: AttendanceState
  recorded: number
  expected: number
  className?: string
}) {
  const { label, icon: Icon, className: tone } = STATE_STYLE[state]
  const showCount = state === "PARTIAL" || state === "COMPLETE" || state === "NOT_RECORDED"
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm whitespace-nowrap", tone, className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
      {showCount && (
        <span className="tabular-nums text-muted-foreground">
          {recorded}/{expected}
        </span>
      )}
    </span>
  )
}
