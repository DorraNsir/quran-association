"use client"

import { ChevronDown, CircleCheck, CircleMinus, CircleSlash, CircleX, Clock, Mic, type LucideIcon } from "lucide-react"
import { useState } from "react"

import { QueryState } from "@/components/shared/query-state"
import { useRecitationHistory } from "@/lib/api/work-followup"
import { formatDate } from "@/lib/format"
import { nextRecitationText, recitationLabel, recitationsCount } from "@/lib/quran-reference/work-assignment"
import { surahByNumber } from "@/lib/quran/surahs"
import { cn } from "@/lib/utils"
import type { RecitationAttempt, RecitationEntry, RecitationSurahHistory } from "@/types/work-followup"

const surahName = (n: number) => `سورة ${surahByNumber(n)?.nameAr ?? n}`

/** Icon + tone per result; the words always say it too (never colour alone). */
const ENTRY_LOOK: Record<RecitationEntry, { icon: LucideIcon; tone: string }> = {
  COMPLETED: { icon: CircleCheck, tone: "border-primary/30 bg-brand-soft text-brand-soft-foreground" },
  PARTIAL: { icon: CircleMinus, tone: "border-warning/40 bg-warning-soft text-warning" },
  NOT_COMPLETED: { icon: CircleX, tone: "border-destructive/40 bg-destructive/10 text-destructive" },
  CANCELLED: { icon: CircleSlash, tone: "border-destructive/30 bg-destructive/5 text-destructive" },
  POSTPONED: { icon: Clock, tone: "border-dashed text-muted-foreground" },
  PENDING: { icon: Clock, tone: "border-dashed text-muted-foreground" },
  SESSION_CANCELLED: { icon: CircleSlash, tone: "border-dashed text-muted-foreground" },
}

/**
 * «متابعة العرضات» on the student profile: one row per surah («سورة المجادلة · 3 عرضات»); opening a
 * surah shows its numbered recitations in order, each with its result, and the next number. All
 * values come from the server; no cycles, no target.
 */
export function StudentRecitations({ studentId, initialSurah }: { studentId: string; initialSurah?: number }) {
  const query = useRecitationHistory(studentId)
  const [open, setOpen] = useState<number | null>(initialSurah ?? null)
  const surahs = query.data?.surahs ?? []
  return (
    <QueryState
      query={query}
      empty={surahs.length === 0}
      emptyIcon={Mic}
      emptyTitle="لا توجد عرضات بعد"
      emptyDescription="تظهر هنا عرضات الطالب لكل سورة."
    >
      <ul aria-label="متابعة العرضات" className="space-y-3">
        {surahs.map((s) => (
          <SurahRecitations key={s.surah} history={s} open={open === s.surah} onToggle={() => setOpen(open === s.surah ? null : s.surah)} />
        ))}
      </ul>
    </QueryState>
  )
}

function SurahRecitations({ history, open, onToggle }: { history: RecitationSurahHistory; open: boolean; onToggle: () => void }) {
  const panelId = `recitations-${history.surah}`
  return (
    <li className="rounded-xl border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="flex w-full items-center justify-between gap-3 p-4 text-start">
        <span className="min-w-0">
          <span className="block font-medium">{surahName(history.surah)}</span>
          <span className="block text-xs text-muted-foreground">{recitationsCount(history.attempts)}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 border-t p-4">
          <h3 className="text-sm font-semibold">{surahName(history.surah)} — متابعة العرضات</h3>
          <Entries entries={history.entries} />
          <p className="text-xs text-muted-foreground">{nextRecitationText(history.nextNumber)}</p>
        </div>
      )}
    </li>
  )
}

/** One card per recitation, in order (any number; wraps on small screens). */
function Entries({ entries }: { entries: RecitationAttempt[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {entries.map((e) => {
        const { icon: Icon, tone } = ENTRY_LOOK[e.entry]
        return (
          <li key={e.itemId} data-entry={e.entry} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2", tone)}>
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 space-y-0.5">
              <span className="block text-sm font-medium">{recitationLabel(e.number, e.entry)}</span>
              <span className="block text-xs text-muted-foreground">
                حصة {formatDate(e.sessionDate)}
                {e.evaluatedBy ? ` · ${e.evaluatedBy}` : ""}
              </span>
              {e.evaluationComment && <span className="block text-xs text-muted-foreground">{e.evaluationComment}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
