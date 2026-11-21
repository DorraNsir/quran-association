"use client"

import { CalendarDays } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { cancelledLabel, progressLabel, sessionLabel, sessionPhaseLabel, type SessionPhase } from "@/lib/work-followup"
import type { WorkProgress, WorkSession } from "@/types/work-followup"

/** Wraps any text — long paragraphs, line breaks and unbroken strings — inside its box. */
export const WRAP = "min-w-0 max-w-full break-words [overflow-wrap:anywhere]"

export const programHref = (id: string) => `/teacher/work-followup/${id}`

/** Date, time and «قادمة / جارية / سابقة». */
export function SessionLine({ session, phase, className }: { session: WorkSession; phase: SessionPhase; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-sm", className)}>
      <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
      <span>{sessionLabel(session)}</span>
      <Badge
        variant="outline"
        className={cn(
          "text-[0.7rem]",
          phase === "UPCOMING" && "border-primary/40 text-primary",
          phase === "ONGOING" && "border-warning/50 bg-warning-soft text-warning",
          phase === "PAST" && "text-muted-foreground"
        )}
      >
        {sessionPhaseLabel[phase]}
      </Badge>
    </p>
  )
}

/** «2 من 3 أعمال نشطة منجزة» + bar (the API's numbers); cancelled items counted apart, never a misleading %. */
export function ProgramProgress({ progress: p, className }: { progress: WorkProgress; className?: string }) {
  const percent = p.active ? Math.round((p.completed / p.active) * 100) : 0
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-sm font-medium">{progressLabel(p)}</p>
      {p.active > 0 && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="الأعمال المنجزة"
          aria-valuemin={0}
          aria-valuemax={p.active}
          aria-valuenow={p.completed}
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {[p.pending > 0 && `${p.pending} بانتظار التقييم`, p.cancelled > 0 && cancelledLabel(p.cancelled)].filter(Boolean).join(" · ")}
      </p>
    </div>
  )
}
