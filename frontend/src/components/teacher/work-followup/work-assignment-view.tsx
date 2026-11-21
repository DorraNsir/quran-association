"use client"

import { BookOpenText } from "lucide-react"

import {
  assignmentSummary,
  isDefaultDescription,
  workloadLines,
  type WorkAssignment,
  type WorkloadSnapshot,
  type WorkType,
} from "@/lib/quran-reference/work-assignment"
import { surahByNumber } from "@/lib/quran/surahs"
import { cn } from "@/lib/utils"
import { recitationOrdinal } from "@/lib/work-followup"

const name = (n: number) => surahByNumber(n)?.nameAr ?? String(n)

/** The item's own text, unless it is just the server's default wording of its assignment. */
export function ownDescription(item: {
  type: WorkType
  description: string
  recitationNumber: number | null
  assignment: WorkAssignment | null
}): string | null {
  if (!item.assignment) return item.description
  // today's default wording, or the one an older item was saved with
  const generated = isDefaultDescription(
    item.description,
    item.type,
    item.assignment,
    name,
    item.recitationNumber ? recitationOrdinal(item.recitationNumber) : null
  )
  return generated ? null : item.description
}

/**
 * A structured item: its Quranic summary («سورة البقرة: من الآية 6 إلى الآية 20», «سورة الرحمن» …)
 * and the server's workload, never more precise than the server said: exact values as such,
 * bounded ones qualified («أقل من صفحة»), unavailable ones not shown as numbers. From one hizb the
 * size is given in hizbs («حزبان», «16 حزبًا تقريبًا»), with the exact total page count as a subtle
 * hint («159 صفحة»); the verse count only below 100 verses. No per-item verification sentence.
 */
export function WorkAssignmentView({
  type,
  assignment,
  workload,
  compact,
  className,
}: {
  type: WorkType
  assignment: WorkAssignment
  workload: WorkloadSnapshot | null
  /** One line (cards): the summary and the first workload value */
  compact?: boolean
  className?: string
}) {
  const shown = workload ? workloadLines(type, workload) : null
  const lines = shown?.lines.filter((l) => l.precision !== "unavailable") ?? []
  const visible = compact ? lines.slice(0, 1) : lines
  // The page hint goes with the size it completes, never alone next to a verse count
  const hint = visible.some((l) => l.unit !== "verses") ? shown?.hint : null
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <p className="flex items-start gap-1.5 text-sm font-medium">
        <BookOpenText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 break-words">{assignmentSummary(type, assignment, name)}</span>
      </p>
      {lines.length > 0 && (
        <ul aria-label="مقدار العمل" className="flex flex-wrap items-center gap-1.5">
          {visible.map((l) => (
            <li
              key={l.unit}
              data-precision={l.precision}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs",
                l.precision === "exact" ? "bg-muted text-foreground" : "border border-dashed text-muted-foreground"
              )}
            >
              {l.text}
            </li>
          ))}
          {/* The exact total page count, secondary: it describes the whole assignment */}
          {hint && (
            <li data-hint="pages" aria-label={`مجموع الصفحات: ${hint}`} className="text-[0.7rem] text-muted-foreground">
              {hint}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
