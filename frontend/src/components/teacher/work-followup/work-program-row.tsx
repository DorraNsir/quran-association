"use client"

import {
  ChevronLeft,
  CircleCheck,
  CircleMinus,
  CircleSlash,
  CircleX,
  ClipboardCheck,
  Clock,
  Pencil,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { useEvaluationBlock } from "@/hooks/use-evaluation-block"
import {
  completionParts,
  PERFORMANCE_LABEL,
  workTypeBadges,
  type WorkItemStatus,
} from "@/lib/quran-reference/work-assignment"
import { cn } from "@/lib/utils"
import { evaluationBlockMessage, sessionLabel, sessionPhaseLabel, type SessionPhase } from "@/lib/work-followup"
import type { WorkProgram } from "@/types/work-followup"

import { LEVEL_LOOK, TYPE_LOOK } from "./work-badges"
import { programHref } from "./work-program-card"

/** Results of the items (icon + words, never colour alone). */
const RESULT_LOOK: Record<WorkItemStatus, { icon: LucideIcon; tone: string }> = {
  COMPLETED: { icon: CircleCheck, tone: "text-primary" },
  PARTIAL: { icon: CircleMinus, tone: "text-warning" },
  NOT_COMPLETED: { icon: CircleX, tone: "text-destructive" },
  POSTPONED: { icon: Clock, tone: "text-sky-700 dark:text-sky-300" },
  CANCELLED: { icon: CircleSlash, tone: "text-muted-foreground" },
  NOT_EVALUATED: { icon: Clock, tone: "text-muted-foreground" },
}

/**
 * ONE student + ONE session as one compact row (the mobile card's content, laid out for the
 * desktop): photo (or initial), name and the overall evaluation (the level only, once given), the
 * class and the session's full date, the kinds of work as soft badges, and the items' exact
 * results («1 منجز · 4 ملغاة»). The name links to that program (stretched over the row); the two
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
  const blocked = useEvaluationBlock(program)
  const badges = workTypeBadges(program.items.map((i) => i.type))
  const parts = completionParts(program.items.map((i) => i.status))
  const level = program.overallEvaluation?.level ?? null
  const LevelIcon = level ? LEVEL_LOOK[level].icon : null
  return (
    <li
      data-program={program.id}
      className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 has-[a[data-row-link]:focus-visible]:ring-3 has-[a[data-row-link]:focus-visible]:ring-ring/50"
    >
      <UserAvatar name={name} photoUrl={student.photoUrl ?? undefined} size="lg" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={programHref(program.id)}
            data-row-link
            className="truncate font-semibold outline-none after:absolute after:inset-0 after:content-['']"
            aria-label={`برنامج عمل ${name} — ${sessionLabel(session)}`}
          >
            {name}
          </Link>
          {/* «التقييم العام»: the level only, once given (no clutter otherwise) */}
          {level && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", LEVEL_LOOK[level].tone)} data-overall={level}>
              {LevelIcon && <LevelIcon className="size-3.5 shrink-0" aria-hidden />}
              {PERFORMANCE_LABEL[level]}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {session.groupName} · {sessionLabel(session)}
          {showSession && ` · ${sessionPhaseLabel[phase]}`}
        </p>
        {badges.length > 0 && (
          <ul aria-label="أنواع الأعمال" className="flex flex-wrap gap-1.5">
            {badges.map((b) => {
              const { icon: Icon, tone } = TYPE_LOOK[b.type]
              return (
                <li key={b.type} data-type={b.type} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tone)}>
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {b.label}
                </li>
              )
            })}
          </ul>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" data-results>
          {parts.map((part) => {
            const { icon: Icon, tone } = RESULT_LOOK[part.status]
            return (
              <span key={part.status} className={cn("inline-flex items-center gap-1 font-medium", tone)} data-result={part.status}>
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {part.text}
              </span>
            )
          })}
        </p>
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
