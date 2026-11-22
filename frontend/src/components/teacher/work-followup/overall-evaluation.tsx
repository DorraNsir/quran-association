"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Award, Check, Info, Pencil, UserRound } from "lucide-react"
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

import { LEVEL_LOOK } from "./work-badges"

/**
 * «التقييم العام» of a program (after the items) — the mobile design: the saved level prominent, who
 * gave it and when below it, and «تعديل التقييم» revealing the four choices (shown at once while none
 * is given, disabled while the session forbids it). A choice is saved explicitly (a correction worded
 * as such). The server decides when it is allowed; the saved value changes only once it confirms.
 */
export function OverallEvaluationSection({ program }: { program: WorkProgram }) {
  const saved = program.overallEvaluation ?? null
  const [editing, setEditing] = useState(false)
  const [choice, setChoice] = useState<WorkPerformance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const blocked = useEvaluationBlock(program)
  const save = useEvaluateWorkProgram()
  const queryClient = useQueryClient()
  const selected = choice ?? saved?.level ?? null
  const changed = choice !== null && choice !== saved?.level
  const pendingNote = overallPendingNote(program.progress.pending)
  const disabled = blocked !== null || save.isPending
  const choosing = !saved || (editing && blocked === null)
  const LevelIcon = saved ? LEVEL_LOOK[saved.level].icon : null

  function close() {
    setChoice(null)
    setEditing(false)
  }

  function submit() {
    if (!changed || !choice) return
    setError(null)
    save.mutate(
      { id: program.id, version: program.version, overall: choice, items: [] },
      {
        onSuccess: () => {
          close()
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
    <section aria-labelledby="wf-overall">
      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="wf-overall" className="flex flex-1 items-center gap-2 text-base font-semibold">
            <Award className="size-5 text-primary" aria-hidden />
            {OVERALL_EVALUATION.title}
          </h2>
          <div data-overall-saved={saved?.level ?? ""}>
            {saved && LevelIcon ? (
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", LEVEL_LOOK[saved.level].tone)}>
                <LevelIcon className="size-4" aria-hidden />
                {PERFORMANCE_LABEL[saved.level]}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">{OVERALL_EVALUATION.none}</span>
            )}
          </div>
        </div>
        {saved && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-overall-by>
            <UserRound className="size-3.5" aria-hidden />
            آخر تقييم: {[saved.evaluatedBy, formatDate(saved.evaluatedAt.slice(0, 10))].filter(Boolean).join(" · ")}
          </p>
        )}

        {blocked && (
          // worded for this section (the page already announces the items' reason)
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-overall-blocked>
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {blocked === "CANCELLED" ? OVERALL_BLOCKED.cancelled : OVERALL_BLOCKED.notStarted}
          </p>
        )}

        {choosing && (
          <>
            <div role="radiogroup" aria-label={OVERALL_EVALUATION.title} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WORK_PERFORMANCES.map((level) => {
                const on = selected === level
                const Icon = on ? Check : LEVEL_LOOK[level].icon
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
                    <Icon className={cn("size-4", !on && "text-muted-foreground")} aria-hidden />
                    {PERFORMANCE_LABEL[level]}
                  </button>
                )
              })}
            </div>
            {!blocked && pendingNote && <p className="text-xs text-muted-foreground">{pendingNote}</p>}
            {changed && saved && choice && <p className="text-sm font-medium">{overallChangeText(saved.level, choice)}</p>}
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {choosing && (changed || editing) && (
          <div className="flex flex-wrap gap-2">
            {changed && (
              <Button size="sm" onClick={submit} disabled={disabled}>
                {save.isPending ? OVERALL_EVALUATION.saving : OVERALL_EVALUATION.save}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={close} disabled={save.isPending}>
              إلغاء
            </Button>
          </div>
        )}
        {saved && !choosing && !blocked && (
          <Button variant="outline" className="w-full sm:w-auto sm:self-start" onClick={() => setEditing(true)}>
            <Pencil />
            تعديل التقييم
          </Button>
        )}
      </Card>
    </section>
  )
}
