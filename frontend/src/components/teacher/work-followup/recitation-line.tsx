"use client"

import { History, Mic } from "lucide-react"
import Link from "next/link"

import { recitationSummaryText } from "@/lib/quran-reference/work-assignment"
import { surahByNumber } from "@/lib/quran/surahs"
import { cn } from "@/lib/utils"
import type { RecitationSummary } from "@/types/work-followup"

/** The student profile tab with this surah's recitations open. */
export const recitationsHref = (studentId: string, surah: number) => `/teacher/students/${studentId}?tab=recitations&surah=${surah}`

/**
 * «متابعة العرضات» of one structured عرضة, compact: «سورة المجادلة · 3 عرضات» (server values), with a
 * link to the surah's full history unless `compact` (list rows).
 */
export function RecitationLine({
  recitation,
  studentId,
  compact,
  className,
}: {
  recitation: RecitationSummary
  studentId: string
  compact?: boolean
  className?: string
}) {
  const text = recitationSummaryText(`سورة ${surahByNumber(recitation.surah)?.nameAr ?? recitation.surah}`, recitation.attempts)
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", className)} data-recitation={recitation.surah}>
      <span className="inline-flex items-center gap-1">
        <Mic className="size-3 shrink-0 text-primary" aria-hidden />
        <span>{text}</span>
      </span>
      {!compact && (
        <Link href={recitationsHref(studentId, recitation.surah)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <History className="size-3 shrink-0" aria-hidden />
          سجل العرضات
        </Link>
      )}
    </p>
  )
}
