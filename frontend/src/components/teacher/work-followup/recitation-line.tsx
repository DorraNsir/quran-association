"use client"

import { ChevronLeft, History, Mic } from "lucide-react"
import Link from "next/link"

import { recitationsCount, recitationSummaryText } from "@/lib/quran-reference/work-assignment"
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

/**
 * «سجل العرضات» on the program page: a soft row in the عرضة colour — the history on one side, how
 * many recitations of the surah were done («عرضة واحدة» / «3 عرضات») on the other — opening it.
 */
export function RecitationHistoryRow({ recitation, studentId }: { recitation: RecitationSummary; studentId: string }) {
  const text = recitationSummaryText(`سورة ${surahByNumber(recitation.surah)?.nameAr ?? recitation.surah}`, recitation.attempts)
  return (
    <Link
      href={recitationsHref(studentId, recitation.surah)}
      aria-label={`سجل العرضات — ${text}`}
      data-recitation={recitation.surah}
      className="flex min-h-10 items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm transition-colors outline-none hover:bg-violet-100 focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-violet-950/50 dark:hover:bg-violet-950"
    >
      <History className="size-4 shrink-0 text-violet-700 dark:text-violet-300" aria-hidden />
      <span className="flex-1 font-medium text-violet-700 dark:text-violet-300">سجل العرضات</span>
      <span className="text-xs text-muted-foreground" data-recitation-count>
        {recitationsCount(recitation.attempts)}
      </span>
      <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}
