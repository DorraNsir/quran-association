"use client"

import { BadgeCheck, ChevronDown, CircleCheck, CircleSlash, CircleX, Clock, Repeat, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { QueryState } from "@/components/shared/query-state"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api/errors"
import { useRecitationHistory, useStartRecitationCycle } from "@/lib/api/work-followup"
import { formatDate } from "@/lib/format"
import { attemptLabel, cycleName, cycleProgressLong, cycleSummaryText } from "@/lib/quran-reference/work-assignment"
import { surahByNumber } from "@/lib/quran/surahs"
import { cn } from "@/lib/utils"
import type { RecitationAttempt, RecitationCycle, RecitationEntry, RecitationSurahHistory } from "@/types/work-followup"

const surahName = (n: number) => `سورة ${surahByNumber(n)?.nameAr ?? n}`

/** Icon + tone per entry; the words always say it too (never colour alone). */
const ENTRY_LOOK: Record<RecitationEntry, { icon: LucideIcon; tone: string }> = {
  SUCCESS: { icon: CircleCheck, tone: "border-primary/30 bg-brand-soft text-brand-soft-foreground" },
  FAILED: { icon: CircleX, tone: "border-destructive/40 bg-destructive/10 text-destructive" },
  PENDING: { icon: Clock, tone: "border-dashed text-muted-foreground" },
  POSTPONED: { icon: CircleSlash, tone: "border-dashed text-muted-foreground" },
  DROPPED: { icon: CircleSlash, tone: "border-dashed text-muted-foreground" },
  SESSION_CANCELLED: { icon: CircleSlash, tone: "border-dashed text-muted-foreground" },
}

/**
 * «متابعة العرضات» on the student profile: one row per surah with its current cycle; opening a surah
 * shows every cycle with its attempt cards (chronological numbers), earlier records and, once the
 * current cycle is complete, «بدء دورة جديدة» (never automatic). All values come from the server.
 */
export function StudentRecitations({ studentId, initialSurah }: { studentId: string; initialSurah?: number }) {
  const query = useRecitationHistory(studentId)
  const [open, setOpen] = useState<number | null>(initialSurah ?? null)
  const surahs = query.data?.surahs ?? []
  return (
    <QueryState
      query={query}
      empty={surahs.length === 0}
      emptyIcon={Repeat}
      emptyTitle="لا توجد عرضات بعد"
      emptyDescription="تظهر هنا عرضات الطالب لكل سورة: أربع عرضات ناجحة في كل دورة."
    >
      <ul aria-label="متابعة العرضات" className="space-y-3">
        {surahs.map((s) => (
          <SurahRecitations key={s.surah} studentId={studentId} history={s} open={open === s.surah} onToggle={() => setOpen(open === s.surah ? null : s.surah)} />
        ))}
      </ul>
    </QueryState>
  )
}

function SurahRecitations({
  studentId,
  history,
  open,
  onToggle,
}: {
  studentId: string
  history: RecitationSurahHistory
  open: boolean
  onToggle: () => void
}) {
  const current = history.cycles.at(-1)
  const earlierCycles = history.cycles.slice(0, -1).reverse()
  const start = useStartRecitationCycle()
  const panelId = `recitations-${history.surah}`
  return (
    <li className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 p-4 text-start"
      >
        <span className="min-w-0">
          <span className="block font-medium">{surahName(history.surah)}</span>
          <span className="block text-xs text-muted-foreground">
            {current ? cycleSummaryText(current) : `عرضات سابقة فقط (${history.earlier.length})`}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="space-y-4 border-t p-4">
          <h3 className="text-sm font-semibold">{surahName(history.surah)} — متابعة العرضات</h3>
          {current && <CycleView cycle={current} />}
          {history.canStartNewCycle && (
            <Button
              size="sm"
              disabled={start.isPending}
              onClick={() =>
                start.mutate(
                  { studentId, surah: history.surah },
                  {
                    onSuccess: () => toast.success(`بدأت ${current ? cycleName(current.number + 1) : cycleName(1)} — ${surahName(history.surah)}`),
                    onError: (e) => toast.error(errorMessage(e)),
                  }
                )
              }
            >
              <Repeat />
              بدء دورة جديدة
            </Button>
          )}
          {earlierCycles.length > 0 && (
            <section aria-label="الدورات السابقة" className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground">الدورات السابقة</h4>
              {earlierCycles.map((c) => (
                <CycleView key={c.id} cycle={c} />
              ))}
            </section>
          )}
          {history.earlier.length > 0 && (
            <section aria-label="عرضات قبل المتابعة" className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">عرضات سُجّلت قبل متابعة الدورات (لا تُحتسب)</h4>
              <AttemptList entries={history.earlier} />
            </section>
          )}
        </div>
      )}
    </li>
  )
}

function CycleView({ cycle }: { cycle: RecitationCycle }) {
  return (
    <section aria-label={cycleName(cycle.number)} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{cycleName(cycle.number)}</span>
        <span className="text-muted-foreground">·</span>
        <span>{cycleProgressLong(cycle.successes, cycle.required)}</span>
        {cycle.completed && (
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-foreground">
            <BadgeCheck className="size-3.5" aria-hidden />
            مكتملة{cycle.completedAt ? ` — ${formatDate(cycle.completedAt.slice(0, 10))}` : ""}
          </span>
        )}
      </div>
      {/* successes out of the required four, as a meter with its own text */}
      <div
        role="meter"
        aria-label={`${cycleName(cycle.number)}: ${cycleProgressLong(cycle.successes, cycle.required)}`}
        aria-valuemin={0}
        aria-valuemax={cycle.required}
        aria-valuenow={cycle.successes}
        className="flex gap-1"
      >
        {Array.from({ length: cycle.required }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < cycle.successes ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
      {cycle.entries.length === 0 ? <p className="text-xs text-muted-foreground">لم تُبرمج أي عرضة في هذه الدورة بعد.</p> : <AttemptList entries={cycle.entries} />}
    </section>
  )
}

function AttemptList({ entries }: { entries: RecitationAttempt[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {entries.map((e) => {
        const { icon: Icon, tone } = ENTRY_LOOK[e.entry as RecitationEntry]
        return (
          <li key={e.itemId} data-entry={e.entry} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2", tone)}>
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 space-y-0.5">
              <span className="block text-sm font-medium">{attemptLabel(e.attemptNumber, e.entry)}</span>
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
