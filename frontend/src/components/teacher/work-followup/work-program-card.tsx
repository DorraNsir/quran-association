"use client"

import { CalendarDays, ChevronLeft, ClipboardCheck, Pencil, UserRoundPen } from "lucide-react"
import Link from "next/link"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { cancelledLabel, progressLabel, progressOf, sessionLabel, sessionPhaseLabel, type SessionPhase } from "@/lib/work-followup"
import type { MockClass, MockSession, MockStudent, WorkProgram } from "@/types/work-followup"

import { WorkStatusBadge, WorkTypeBadge } from "./work-badges"

/** Wraps any text — long paragraphs, line breaks and unbroken strings — inside its box. */
export const WRAP = "min-w-0 max-w-full break-words [overflow-wrap:anywhere]"

export const programHref = (id: string) => `/teacher/work-followup/${id}`

const PREVIEW = 2

/**
 * ONE student + ONE session = one compact, clickable card: who, when, the
 * progress and a preview of the first two items. Everything else (all the
 * items, their actions) is on the program's page. The student's name is the
 * card's link, stretched over the card; the action buttons sit above it.
 */
export function WorkProgramCard({
  program,
  student,
  klass,
  session,
  phase,
  onEvaluate,
  onEdit,
}: {
  program: WorkProgram
  student: MockStudent
  klass?: MockClass
  session: MockSession
  phase: SessionPhase
  onEvaluate: () => void
  onEdit: () => void
}) {
  const name = `${student.firstName} ${student.lastName}`
  const href = programHref(program.id)
  const more = program.items.length - PREVIEW

  return (
    <Card className="relative gap-0 overflow-hidden p-0 transition-colors hover:border-primary/40 hover:bg-muted/20 has-[a[data-card-link]:focus-visible]:ring-3 has-[a[data-card-link]:focus-visible]:ring-ring/50">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={name} photoUrl={student.photoUrl} />
          <div className="min-w-0">
            <Link
              href={href}
              data-card-link
              className="block truncate font-semibold outline-none after:absolute after:inset-0 after:content-['']"
              aria-label={`برنامج عمل ${name} — ${sessionLabel(session)}`}
            >
              {name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {klass?.groupName} — {klass?.branchName}
            </p>
            <SessionLine session={session} phase={phase} className="mt-1" />
          </div>
        </div>
        <ProgramProgress program={program} className="sm:w-48 sm:shrink-0" />
      </div>

      <ol className="divide-y border-t">
        {program.items.slice(0, PREVIEW).map((item) => (
          <li key={item.id} className="flex items-start gap-3 px-4 py-2.5">
            <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber} />
            {/* Two lines at most here — the full text is on the program's page */}
            <p className={cn("line-clamp-2 flex-1 text-sm", WRAP)}>{item.description}</p>
            <WorkStatusBadge status={item.status} className="shrink-0" />
          </li>
        ))}
      </ol>
      {more > 0 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">+ {more === 1 ? "عمل آخر" : `${more} أعمال أخرى`}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <UserRoundPen className="size-3.5" aria-hidden />
          آخر تعديل بواسطة: {program.lastEditedBy}
        </p>
        {/* Above the stretched link: these never open the program */}
        <div className="relative z-10 flex flex-wrap gap-1.5">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil />
            تعديل البرنامج
          </Button>
          <Button variant="outline" size="sm" onClick={onEvaluate}>
            <ClipboardCheck />
            تقييم الأعمال
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-primary">
            <Link href={href}>
              عرض تفاصيل البرنامج
              <ChevronLeft />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Date, time and «قادمة / جارية / سابقة». */
export function SessionLine({ session, phase, className }: { session: MockSession; phase: SessionPhase; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-sm", className)}>
      <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
      <span>{sessionLabel(session)}</span>
      <Badge
        variant="outline"
        className={cn(
          "text-[0.7rem]",
          phase === "UPCOMING" && "border-primary/40 text-primary",
          phase === "ONGOING" && "border-warning/50 bg-warning-soft text-warning",
          phase === "PAST" && "text-muted-foreground"
        )}
      >
        {sessionPhaseLabel[phase]}
      </Badge>
    </p>
  )
}

/** «2 من 3 أعمال نشطة منجزة» + bar; cancelled items counted apart, never a misleading % . */
export function ProgramProgress({ program, className }: { program: Pick<WorkProgram, "items">; className?: string }) {
  const p = progressOf(program)
  const percent = p.active ? Math.round((p.completed / p.active) * 100) : 0
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-sm font-medium">{progressLabel(p)}</p>
      {p.active > 0 && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="الأعمال المنجزة"
          aria-valuemin={0}
          aria-valuemax={p.active}
          aria-valuenow={p.completed}
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {[p.pending > 0 && `${p.pending} بانتظار التقييم`, p.cancelled > 0 && cancelledLabel(p.cancelled)].filter(Boolean).join(" · ")}
      </p>
    </div>
  )
}
