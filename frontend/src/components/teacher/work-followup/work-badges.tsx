import {
  Ban,
  BarChart3,
  BookOpen,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  ClipboardList,
  Clock,
  Mic,
  RefreshCw,
  Star,
  ThumbsUp,
  Trophy,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { WorkPerformance } from "@/lib/quran-reference/work-assignment"
import { workStatusLabel, workTypeLabel } from "@/lib/work-followup"
import { cn } from "@/lib/utils"
import type { WorkStatus, WorkType } from "@/types/work-followup"

/**
 * Work types: soft colour + icon of their own (the mobile palette) — حفظ blue, مراجعة teal, عرضة
 * purple, اختبار amber. Purple marks the عرضة TYPE only: never an action, never a result.
 */
export const TYPE_LOOK: Record<WorkType, { icon: LucideIcon; tone: string }> = {
  MEMORIZATION: { icon: BookOpen, tone: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  REVISION: { icon: RefreshCw, tone: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
  RECITATION: { icon: Mic, tone: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  EXAM: { icon: ClipboardList, tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
}

/** «التقييم العام»: the level only, with an icon of its own. */
export const LEVEL_LOOK: Record<WorkPerformance, { icon: LucideIcon; tone: string }> = {
  EXCELLENT: { icon: Trophy, tone: "bg-brand-soft text-brand-soft-foreground" },
  VERY_GOOD: { icon: ThumbsUp, tone: "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
  GOOD: { icon: Star, tone: "bg-warning-soft text-warning" },
  NEEDS_IMPROVEMENT: { icon: BarChart3, tone: "bg-destructive/10 text-destructive" },
}

/** Subtle, green-first status styles — icon + label, never color alone. */
export const WORK_STATUS_STYLE: Record<WorkStatus, { icon: LucideIcon; badge: string; selected: string }> = {
  NOT_EVALUATED: { icon: CircleDashed, badge: "border-dashed bg-transparent text-muted-foreground", selected: "border-foreground/40 bg-muted text-foreground" },
  COMPLETED: { icon: CircleCheck, badge: "bg-brand-soft text-brand-soft-foreground", selected: "border-primary bg-primary text-primary-foreground" },
  NOT_COMPLETED: { icon: CircleX, badge: "bg-destructive/10 text-destructive", selected: "border-destructive bg-destructive text-white" },
  PARTIAL: { icon: CircleMinus, badge: "bg-warning-soft text-warning", selected: "border-warning bg-warning text-white" },
  POSTPONED: { icon: Clock, badge: "bg-sky-50 text-sky-800", selected: "border-sky-700 bg-sky-700 text-white" },
  // A dropped work item (not a cancelled session): neutral gray
  CANCELLED: { icon: Ban, badge: "bg-muted text-muted-foreground", selected: "border-muted-foreground bg-muted-foreground text-background" },
}

export function WorkTypeBadge({ type, recitationNumber, size }: { type: WorkType; recitationNumber?: number; size?: "lg" }) {
  const { icon: Icon, tone } = TYPE_LOOK[type]
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent font-medium", tone, size === "lg" && "h-7 gap-1.5 px-3 text-sm")} data-type={type}>
      <Icon className={size === "lg" ? "size-4" : "size-3"} aria-hidden />
      {workTypeLabel[type]}
      {type === "RECITATION" && recitationNumber ? <span className="tabular-nums">{recitationNumber}</span> : null}
    </Badge>
  )
}

export function WorkStatusBadge({ status, className, size }: { status: WorkStatus; className?: string; size?: "lg" }) {
  const { icon: Icon, badge } = WORK_STATUS_STYLE[status]
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent", badge, size === "lg" && "h-7 gap-1.5 px-3 text-sm", className)} data-status={status}>
      <Icon className={size === "lg" ? "size-4" : "size-3"} aria-hidden />
      {workStatusLabel[status]}
    </Badge>
  )
}
