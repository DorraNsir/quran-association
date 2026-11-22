"use client"

import { ArrowLeftRight, ChevronRight, ClipboardCheck, CornerDownLeft, Mic, NotebookText, Pencil, UserRoundPen } from "lucide-react"
import Link from "next/link"

import { NotFoundState } from "@/components/shared/not-found-state"
import { QueryState } from "@/components/shared/query-state"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useEvaluationBlock } from "@/hooks/use-evaluation-block"
import { ApiError } from "@/lib/api/errors"
import { useWorkProgram } from "@/lib/api/work-followup"
import { todayInTunis } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { carriedFromLabel, evaluationBlockMessage, isTransferable, phaseOf } from "@/lib/work-followup"
import type { WorkProgram } from "@/types/work-followup"

import { OverallEvaluationSection } from "./overall-evaluation"
import { RecitationLine } from "./recitation-line"
import { ownDescription, WorkAssignmentView } from "./work-assignment-view"
import { WorkStatusBadge, WorkTypeBadge } from "./work-badges"
import { useWorkFollowup } from "./work-followup-provider"
import { ProgramProgress, SessionLine, WRAP } from "./work-program-card"

const BACK = "/teacher/work-followup"

/**
 * One work program in full (from the API): every item with its complete
 * description, result, comment, transfer history and actions — the same
 * sheets / dialogs as the list. A program the teacher may not see (another
 * class, a session they did not teach) is "not found" for them.
 */
export function WorkProgramDetails({ programId }: { programId: string }) {
  const query = useWorkProgram(programId)

  if (query.error instanceof ApiError && (query.error.isNotFound || query.error.isForbidden || query.error.status === 400))
    return <NotFoundState title="برنامج العمل غير موجود" backHref={BACK} backLabel="العودة إلى متابعة العمل" />
  const program = query.data
  if (!program) return <QueryState query={query}>{null}</QueryState>
  return <ProgramView program={program} />
}

function ProgramView({ program }: { program: WorkProgram }) {
  const { openEdit, openEvaluate, openSchedule } = useWorkFollowup()
  const today = todayInTunis()
  const blocked = useEvaluationBlock(program)
  const { student, session, progress: p } = program
  const name = `${student.firstName} ${student.lastName}`

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ms-2 text-muted-foreground">
        <Link href={BACK}>
          <ChevronRight />
          العودة إلى متابعة العمل
        </Link>
      </Button>

      <Card className="mb-6 gap-0 p-0">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar name={name} photoUrl={student.photoUrl ?? undefined} size="lg" />
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">برنامج عمل {name}</h1>
              <p className="text-sm text-muted-foreground">
                {session.groupName} — {session.branchName}
              </p>
              <SessionLine session={session} phase={phaseOf(session, today)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openEdit(program)}>
              <Pencil />
              تعديل البرنامج
            </Button>
            <Button onClick={() => openEvaluate(program)} disabled={blocked !== null} aria-describedby={blocked ? "wf-eval-blocked" : undefined}>
              <ClipboardCheck />
              تقييم الأعمال
            </Button>
          </div>
        </div>
        {blocked && (
          <p id="wf-eval-blocked" role="status" className="border-t bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
            {evaluationBlockMessage[blocked]}
          </p>
        )}
        {/* <div className="grid gap-4 border-t p-5 sm:grid-cols-[1fr_16rem]">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "كل الأعمال", value: p.total },
              { label: "منجزة", value: p.completed },
              { label: "بانتظار التقييم", value: p.pending },
              { label: "ملغاة", value: p.cancelled },
            ].map((tile) => (
              <div key={tile.label} className="flex flex-col-reverse rounded-lg bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">{tile.label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{tile.value}</dd>
              </div>
            ))}
          </dl>
          <ProgramProgress progress={p} />
        </div> */}
      </Card>

      <section aria-labelledby="wf-items" className="space-y-3">
        <h2 id="wf-items" className="text-base font-semibold">
          الأعمال <span className="text-sm font-normal text-muted-foreground">({p.total})</span>
        </h2>
        <Card className="gap-0 p-0">
          <ol className="divide-y">
            {program.items.map((item) => {
              return (
                <li key={item.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber ?? undefined} />
                    <WorkStatusBadge status={item.status} />
                  </div>
                  {/* Complete description: paragraphs, line breaks and unbroken strings all wrap */}
                  {item.assignment && <WorkAssignmentView type={item.type} assignment={item.assignment} workload={item.workload} />}
                  {/* «متابعة العرضات»: this surah's current cycle, and a way to its full history */}
                  {item.recitation && <RecitationLine recitation={item.recitation} studentId={student.id} />}
                  {/* Legacy free text as written; for a structured item, only the teacher's own note */}
                  {ownDescription(item) && (
                    <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", WRAP, item.assignment && "text-muted-foreground")}>
                      {ownDescription(item)}
                    </p>
                  )}
                  {item.evaluationComment && (
                    <p className={cn("rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap", WRAP)}>
                      <span className="font-medium text-foreground">تعليق التقييم: </span>
                      {item.evaluationComment}
                    </p>
                  )}
                  {item.carriedFrom && (
                    <p className="flex items-center gap-1 text-xs text-primary">
                      <CornerDownLeft className="size-3 shrink-0" aria-hidden />
                      {/* The source's status WHEN it was carried (kept by the API) */}
                      {carriedFromLabel(item.carriedFrom)}
                    </p>
                  )}
                  {item.continuedFrom && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mic className="size-3 shrink-0" aria-hidden />
                      تلي عرضة حصة {formatDate(item.continuedFrom.sessionDate)}
                    </p>
                  )}
                  {item.carriedTo.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowLeftRight className="size-3 shrink-0" aria-hidden />
                      نُقل إلى حصة {item.carriedTo.map((c) => formatDate(c.sessionDate)).join("، ")}
                    </p>
                  )}
                  {item.continuedBy.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mic className="size-3 shrink-0" aria-hidden />
                      العرضة التالية مبرمجة في حصة {item.continuedBy.map((c) => formatDate(c.sessionDate)).join("، ")}
                    </p>
                  )}
                  {(isTransferable(item.status, session.status) || item.type === "RECITATION") && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {isTransferable(item.status, session.status) && (
                        <Button variant="outline" size="sm" onClick={() => openSchedule("carry", item, program)}>
                          <ArrowLeftRight />
                          نقل إلى الحصة القادمة
                        </Button>
                      )}
                      {item.type === "RECITATION" && (
                        <Button variant="outline" size="sm" onClick={() => openSchedule("next", item, program)}>
                          <Mic />
                          إضافة العرضة التالية
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </Card>
      </section>

      {/* «التقييم العام»: after the individual results, separate from them */}
      <div className="mt-6">
        <OverallEvaluationSection key={`${program.id}-${program.version}`} program={program} />
      </div>

      <section aria-label="ملاحظات البرنامج" className="mt-6 space-y-3">
        {program.generalNotes && (
          <Card className="flex-row items-start gap-2 p-4 text-sm">
            <NotebookText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className={cn("whitespace-pre-wrap", WRAP)}>
              <span className="font-medium">ملاحظات المعلم: </span>
              {program.generalNotes}
            </p>
          </Card>
        )}

        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <UserRoundPen className="size-3.5" aria-hidden />
          آخر تعديل بواسطة: {program.lastEditedBy}
        </p>
      </section>
    </>
  )
}
