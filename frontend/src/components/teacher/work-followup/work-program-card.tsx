"use client"

import { ArrowLeftRight, CalendarDays, ClipboardCheck, CornerDownLeft, Mic, MoreHorizontal, NotebookText, Pencil, UserRoundPen } from "lucide-react"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatShortDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { carriedCopiesOf, isUnfinished, originOf, progressOf, sessionLabel, sessionPhaseLabel, workStatusLabel, type SessionPhase } from "@/lib/work-followup"
import type { MockClass, MockSession, MockStudent, WorkItem, WorkProgram } from "@/types/work-followup"

import { WorkStatusBadge, WorkTypeBadge } from "./work-badges"

/**
 * ONE student + ONE session = one card: who, when, what (all the work items
 * together), the results, and what comes next (continue unfinished work,
 * schedule the next recitation).
 */
export function WorkProgramCard({
  program,
  student,
  klass,
  session,
  phase,
  programs,
  sessionsById,
  onEvaluate,
  onEdit,
  onCarry,
  onNextRecitation,
}: {
  program: WorkProgram
  student: MockStudent
  klass?: MockClass
  session: MockSession
  phase: SessionPhase
  /** Every program (to show where an item came from / was carried to) */
  programs: WorkProgram[]
  sessionsById: Map<string, MockSession>
  onEvaluate: () => void
  onEdit: () => void
  onCarry: (item: WorkItem) => void
  onNextRecitation: (item: WorkItem) => void
}) {
  const name = `${student.firstName} ${student.lastName}`
  const { total, completed, pending } = progressOf(program)
  const percent = total ? Math.round((completed / total) * 100) : 0
  const dateOf = (sessionId: string) => {
    const s = sessionsById.get(sessionId)
    return s ? formatShortDate(s.date) : "—"
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      {/* WHO · WHEN · RESULT */}
      <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={name} photoUrl={student.photoUrl} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {klass?.groupName} — {klass?.branchName}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
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
          </div>
        </div>
        <div className="space-y-1.5 sm:w-48 sm:shrink-0">
          <p className="text-sm font-medium">
            <span className="tabular-nums">{completed}</span> من <span className="tabular-nums">{total}</span> أعمال منجزة
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="الأعمال المنجزة" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          {pending > 0 && <p className="text-xs text-muted-foreground">{pending} بانتظار التقييم</p>}
        </div>
      </div>

      {/* WHAT · per-item RESULT · NEXT */}
      <ol className="divide-y">
        {program.items.map((item) => {
          const origin = originOf(programs, item.carriedFromItemId)
          const copies = carriedCopiesOf(programs, item.id)
          const canCarry = isUnfinished(item.status)
          const canNext = item.type === "RECITATION"
          return (
            <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber} />
                  <span className="text-sm font-medium">{item.description}</span>
                </div>
                {item.evaluationComment && <p className="text-xs text-muted-foreground">{item.evaluationComment}</p>}
                {origin && (
                  <p className="flex items-center gap-1 text-xs text-primary">
                    <CornerDownLeft className="size-3" aria-hidden />
                    منقول من حصة {dateOf(origin.program.sessionId)} ({workStatusLabel[origin.item.status]})
                  </p>
                )}
                {copies.length > 0 && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowLeftRight className="size-3" aria-hidden />
                    نُقل إلى حصة {copies.map((c) => dateOf(c.program.sessionId)).join("، ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 self-start">
                <WorkStatusBadge status={item.status} />
                {(canCarry || canNext) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7" aria-label={`إجراءات: ${item.description}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canCarry && (
                        <DropdownMenuItem onSelect={() => onCarry(item)}>
                          <ArrowLeftRight />
                          نقل إلى الحصة القادمة
                        </DropdownMenuItem>
                      )}
                      {canNext && (
                        <DropdownMenuItem onSelect={() => onNextRecitation(item)}>
                          <Mic />
                          إضافة العرضة التالية
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {program.generalNotes && (
        <div className="flex items-start gap-2 border-t bg-brand-soft/20 px-4 py-3 text-sm">
          <NotebookText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-medium">ملاحظات المعلم: </span>
            {program.generalNotes}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <UserRoundPen className="size-3.5" aria-hidden />
          آخر تعديل بواسطة: {program.lastEditedBy}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil />
            تعديل البرنامج
          </Button>
          <Button variant={phase === "UPCOMING" ? "outline" : "default"} size="sm" onClick={onEvaluate}>
            <ClipboardCheck />
            تقييم الأعمال
          </Button>
        </div>
      </div>
    </Card>
  )
}
