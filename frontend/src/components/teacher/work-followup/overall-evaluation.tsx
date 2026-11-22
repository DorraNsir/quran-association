"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Award, Check, Info } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useEvaluationBlock } from "@/hooks/use-evaluation-block"
import { ApiError, errorMessage } from "@/lib/api/errors"
import { useEvaluateWorkProgram, workKeys } from "@/lib/api/work-followup"
import { formatDate } from "@/lib/format"
import {
  OVERALL_BLOCKED,
  OVERALL_EVALUATION,
  overallChangeText,
  overallPendingNote,
  PERFORMANCE_LABEL,
  WORK_PERFORMANCES,
  type WorkPerformance,
} from "@/lib/quran-reference/work-assignment"
import { cn } from "@/lib/utils"
import type { WorkProgram } from "@/types/work-followup"

/**
 * «التقييم العام» of a program (after the items): four choices, the saved one marked by a check,
 * a choice saved explicitly («حفظ التقييم العام», a correction worded as such). The server decides
 * when it is allowed; the saved value changes only once it confirms.
 */
export function OverallEvaluationSection({ program }: { program: WorkProgram }) {
  const saved = program.overallEvaluation ?? null
  const [choice, setChoice] = useState<WorkPerformance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const blocked = useEvaluationBlock(program)
  const save = useEvaluateWorkProgram()
  const queryClient = useQueryClient()
  const selected = choice ?? saved?.level ?? null
  const changed = choice !== null && choice !== saved?.level
  const pendingNote = overallPendingNote(program.progress.pending)
  const disabled = blocked !== null || save.isPending

  function submit() {
    if (!changed || !choice) return
    setError(null)
    save.mutate(
      { id: program.id, version: program.version, overall: choice, items: [] },
      {
        onSuccess: () => {
          setChoice(null)
          toast.success(OVERALL_EVALUATION.saved, { description: PERFORMANCE_LABEL[choice] })
        },
        // 409 (stale version): the server's message; the program is reloaded by the mutation
        onError: (e) => {
          const stale = e instanceof ApiError && e.code === "WORK_PROGRAM_CHANGED"
          setError(errorMessage(e) + (stale ? " أُعيد تحميل البرنامج، أعد الاختيار." : ""))
          // the newer program (and evaluation) is loaded; nothing is overwritten
          if (stale) void queryClient.invalidateQueries({ queryKey: workKeys.one(program.id) })
        },
      }
    )
  }

  return (
    <section aria-labelledby="wf-overall" className="space-y-3">
      <h2 id="wf-overall" className="flex items-center gap-2 text-base font-semibold">
        <Award className="size-4 text-primary" aria-hidden />
        {OVERALL_EVALUATION.title}
      </h2>
      <Card className="gap-3 p-4">
        <p className="text-xs text-muted-foreground">{OVERALL_EVALUATION.hint}</p>
        <p className="text-sm" data-overall-saved={saved?.level ?? ""}>
          {saved ? (
            <>
              <span className="font-medium">{PERFORMANCE_LABEL[saved.level]}</span>
              <span className="text-xs text-muted-foreground">
                {" — "}
                {saved.evaluatedBy ? `${saved.evaluatedBy} · ` : ""}
                {formatDate(saved.evaluatedAt.slice(0, 10))}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{OVERALL_EVALUATION.none}</span>
          )}
        </p>
        <div role="radiogroup" aria-label={OVERALL_EVALUATION.title} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WORK_PERFORMANCES.map((level) => {
            const on = selected === level
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => setChoice(level)}
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                )}
              >
                {on && <Check className="size-4" aria-hidden />}
                {PERFORMANCE_LABEL[level]}
              </button>
            )
          })}
        </div>
        {blocked ? (
          // worded for this section (the page already announces the items' reason)
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-overall-blocked>
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {blocked === "CANCELLED" ? OVERALL_BLOCKED.cancelled : OVERALL_BLOCKED.notStarted}
          </p>
        ) : (
          pendingNote && <p className="text-xs text-muted-foreground">{pendingNote}</p>
        )}
        {changed && saved && choice && <p className="text-sm font-medium">{overallChangeText(saved.level, choice)}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {changed && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={submit} disabled={disabled}>
              {save.isPending ? OVERALL_EVALUATION.saving : OVERALL_EVALUATION.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChoice(null)} disabled={save.isPending}>
              إلغاء
            </Button>
          </div>
        )}
      </Card>
    </section>
  )
}
