"use client"

import { Award, ChevronLeft, CircleCheck, CircleMinus, CircleSlash, ClipboardCheck, Clock, Mic, Pencil, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { useEvaluationBlock } from "@/hooks/use-evaluation-block"
import { overallRowText, programStatus, recitationSummaryText, workTypesSummary, type ProgramStatusKind } from "@/lib/quran-reference/work-assignment"
import { surahByNumber } from "@/lib/quran/surahs"
import { cn } from "@/lib/utils"
import { evaluationBlockMessage, sessionLabel, sessionPhaseLabel, type SessionPhase } from "@/lib/work-followup"
import type { WorkProgram } from "@/types/work-followup"

import { programHref } from "./work-program-card"

/** Icon + words per state (never colour alone). */
const STATUS_LOOK: Record<ProgramStatusKind, { icon: LucideIcon; tone: string }> = {
  pending: { icon: Clock, tone: "text-muted-foreground" },
  partial: { icon: CircleMinus, tone: "text-warning" },
  unfinished: { icon: CircleMinus, tone: "text-warning" },
  done: { icon: CircleCheck, tone: "text-primary" },
  cancelled: { icon: CircleSlash, tone: "text-muted-foreground" },
}

/**
 * ONE student + ONE session as one compact row: photo (or initial), name, class and — unless the
 * list is already narrowed to one session — the session, the kinds of work («حفظ · مراجعة · عرضة»)
 * and the evaluation state. The name links to that program (stretched over the row); the two
 * actions sit above the link. Everything else is on the program's page.
 */
export function WorkProgramRow({
  program,
  phase,
  showSession,
  onEvaluate,
  onEdit,
}: {
  program: WorkProgram
  phase: SessionPhase
  /** false when the list is filtered to one session (no repeated date) */
  showSession: boolean
  onEvaluate: () => void
  onEdit: () => void
}) {
  const { student, session } = program
  const name = `${student.firstName} ${student.lastName}`
  const status = programStatus(program.progress)
  const { icon: StatusIcon, tone } = STATUS_LOOK[status.kind]
  const blocked = useEvaluationBlock(program)
  const types = workTypesSummary(program.items.map((i) => i.type))
  // «متابعة العرضات»: «سورة المجادلة · 3 عرضات» per structured عرضة (none for the others)
  const recitations =
    program.items
      .flatMap((i) => (i.recitation ? [recitationSummaryText(`سورة ${surahByNumber(i.recitation.surah)?.nameAr ?? i.recitation.surah}`, i.recitation.attempts)] : []))
      .join("؛ ") || null
  const overall = overallRowText(program.overallEvaluation?.level)
  return (
    <li
      data-program={program.id}
      className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 has-[a[data-row-link]:focus-visible]:ring-3 has-[a[data-row-link]:focus-visible]:ring-ring/50"
    >
      <UserAvatar name={name} photoUrl={student.photoUrl ?? undefined} size="lg" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <Link
          href={programHref(program.id)}
          data-row-link
          className="block truncate font-semibold outline-none after:absolute after:inset-0 after:content-['']"
          aria-label={`برنامج عمل ${name} — ${sessionLabel(session)}`}
        >
          {name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {session.groupName}
          {showSession && ` · ${sessionLabel(session)} · ${sessionPhaseLabel[phase]}`}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {types && <span className="text-foreground">{types}</span>}
          <span className={cn("inline-flex items-center gap-1", tone)} data-status={status.kind}>
            <StatusIcon className="size-3.5 shrink-0" aria-hidden />
            {status.text}
          </span>
          {/* «التقييم العام»: only once given (no clutter otherwise); separate from the items' state */}
          {overall && (
            <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-0.5 text-brand-soft-foreground" data-overall>
              <Award className="size-3.5 shrink-0" aria-hidden />
              {overall}
            </span>
          )}
        </p>
        {/* «متابعة العرضات»: structured recitations only, one line */}
        {recitations && (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground" data-recitations>
            <Mic className="size-3 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{recitations}</span>
          </p>
        )}
      </div>
      {/* Above the stretched link: these never open the program */}
      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" className="size-9" onClick={onEdit} aria-label={`تعديل البرنامج — ${name}`} title="تعديل البرنامج">
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onEvaluate}
          disabled={blocked !== null}
          aria-label={`تقييم الأعمال — ${name}`}
          aria-describedby={blocked ? `wf-eval-${program.id}` : undefined}
          title={blocked ? evaluationBlockMessage[blocked] : "تقييم الأعمال"}
        >
          <ClipboardCheck />
        </Button>
        {blocked && (
          <span id={`wf-eval-${program.id}`} className="sr-only">
            {evaluationBlockMessage[blocked]}
          </span>
        )}
      </div>
      <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </li>
  )
}
