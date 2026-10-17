import { BookOpen, CircleCheck, CircleDashed, CircleMinus, CircleX, ClipboardCheck, Clock, Mic, RotateCcw, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { workStatusLabel, workTypeLabel } from "@/lib/work-followup"
import { cn } from "@/lib/utils"
import type { WorkStatus, WorkType } from "@/types/work-followup"

const TYPE_ICON: Record<WorkType, LucideIcon> = {
  MEMORIZATION: BookOpen,
  REVISION: RotateCcw,
  RECITATION: Mic,
  EXAM: ClipboardCheck,
}

/** Subtle, green-first status styles — icon + label, never color alone. */
export const WORK_STATUS_STYLE: Record<WorkStatus, { icon: LucideIcon; badge: string; selected: string }> = {
  NOT_EVALUATED: { icon: CircleDashed, badge: "border-dashed bg-transparent text-muted-foreground", selected: "border-foreground/40 bg-muted text-foreground" },
  COMPLETED: { icon: CircleCheck, badge: "bg-brand-soft text-brand-soft-foreground", selected: "border-primary bg-primary text-primary-foreground" },
  NOT_COMPLETED: { icon: CircleX, badge: "bg-destructive/10 text-destructive", selected: "border-destructive bg-destructive text-white" },
  PARTIAL: { icon: CircleMinus, badge: "bg-warning-soft text-warning", selected: "border-warning bg-warning text-white" },
  POSTPONED: { icon: Clock, badge: "bg-muted text-muted-foreground", selected: "border-foreground/60 bg-foreground/80 text-background" },
}

export function WorkTypeBadge({ type, recitationNumber }: { type: WorkType; recitationNumber?: number }) {
  const Icon = TYPE_ICON[type]
  return (
    <Badge variant="outline" className="gap-1 bg-background font-medium">
      <Icon className="size-3" aria-hidden />
      {workTypeLabel[type]}
      {type === "RECITATION" && recitationNumber ? <span className="tabular-nums">{recitationNumber}</span> : null}
    </Badge>
  )
}

export function WorkStatusBadge({ status, className }: { status: WorkStatus; className?: string }) {
  const { icon: Icon, badge } = WORK_STATUS_STYLE[status]
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent", badge, className)}>
      <Icon className="size-3" aria-hidden />
      {workStatusLabel[status]}
    </Badge>
  )
}
