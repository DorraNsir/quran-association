"use client"

import { History, Repeat } from "lucide-react"
import Link from "next/link"

import { cycleSummaryText } from "@/lib/quran-reference/work-assignment"
import { cn } from "@/lib/utils"
import type { RecitationCycleSummary } from "@/types/work-followup"

/** The student profile tab with this surah's full recitation history open. */
export const recitationsHref = (studentId: string, surah: number) => `/teacher/students/${studentId}?tab=recitations&surah=${surah}`

/**
 * «متابعة العرضات» of one عرضة item, compact: «الدورة الأولى · 3/4 ناجحة» (the server's values),
 * with a link to the full history unless `compact` (list cards).
 */
export function RecitationCycleLine({
  cycle,
  studentId,
  compact,
  className,
}: {
  cycle: RecitationCycleSummary
  studentId: string
  compact?: boolean
  className?: string
}) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", className)} data-recitation-cycle={cycle.cycleId}>
      <span className="inline-flex items-center gap-1">
        <Repeat className="size-3 shrink-0 text-primary" aria-hidden />
        <span>{cycleSummaryText(cycle)}</span>
      </span>
      {!compact && (
        <Link href={recitationsHref(studentId, cycle.surah)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <History className="size-3 shrink-0" aria-hidden />
          سجل العرضات
        </Link>
      )}
    </p>
  )
}
