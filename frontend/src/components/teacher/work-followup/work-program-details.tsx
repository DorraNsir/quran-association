"use client"

import { ArrowLeftRight, ChevronRight, ClipboardCheck, CornerDownLeft, Mic, NotebookText, Pencil, UserRoundPen } from "lucide-react"
import Link from "next/link"

import { NotFoundState } from "@/components/shared/not-found-state"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { carriedCopiesOf, isTransferable, originOf, phaseOf, progressOf, workStatusLabel } from "@/lib/work-followup"

import { WorkStatusBadge, WorkTypeBadge } from "./work-badges"
import { useWorkFollowup } from "./work-followup-provider"
import { ProgramProgress, SessionLine, WRAP } from "./work-program-card"

const BACK = "/teacher/work-followup"

/**
 * One work program in full: every item with its complete description,
 * result, comment, transfer history and actions. Same shared prototype state
 * and the same sheets / dialogs as the list (no duplicated logic).
 */
export function WorkProgramDetails({ programId }: { programId: string }) {
  const { data, today, studentsById, classesById, sessionsById, openEdit, openEvaluate, openSchedule } = useWorkFollowup()
  const program = data.programs.find((p) => p.id === programId)
  const student = program && studentsById.get(program.studentId)
  const session = program && sessionsById.get(program.sessionId)

  if (!program || !student || !session)
    return <NotFoundState title="برنامج العمل غير موجود" backHref={BACK} backLabel="العودة إلى متابعة العمل" />

  const name = `${student.firstName} ${student.lastName}`
  const klass = classesById.get(student.groupClassId)
  const p = progressOf(program)
  const dateOf = (sessionId: string) => {
    const s = sessionsById.get(sessionId)
    return s ? formatDate(s.date) : "—"
  }

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
            <UserAvatar name={name} photoUrl={student.photoUrl} size="lg" />
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">برنامج عمل {name}</h1>
              <p className="text-sm text-muted-foreground">
                {klass?.groupName} — {klass?.branchName}
              </p>
              <SessionLine session={session} phase={phaseOf(session, today)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openEdit(program)}>
              <Pencil />
              تعديل البرنامج
            </Button>
            <Button onClick={() => openEvaluate(program)}>
              <ClipboardCheck />
              تقييم الأعمال
            </Button>
          </div>
        </div>
        <div className="grid gap-4 border-t p-5 sm:grid-cols-[1fr_16rem]">
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
          <ProgramProgress program={program} />
        </div>
      </Card>

      <section aria-labelledby="wf-items" className="space-y-3">
        <h2 id="wf-items" className="text-base font-semibold">
          الأعمال <span className="text-sm font-normal text-muted-foreground">({p.total})</span>
        </h2>
        <Card className="gap-0 p-0">
          <ol className="divide-y">
            {program.items.map((item) => {
              const origin = originOf(data.programs, item.carriedFromItemId)
              const copies = carriedCopiesOf(data.programs, item.id)
              return (
                <li key={item.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber} />
                    <WorkStatusBadge status={item.status} />
                  </div>
                  {/* Complete description: paragraphs, line breaks and unbroken strings all wrap */}
                  <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", WRAP)}>{item.description}</p>
                  {item.evaluationComment && (
                    <p className={cn("rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap", WRAP)}>
                      <span className="font-medium text-foreground">تعليق التقييم: </span>
                      {item.evaluationComment}
                    </p>
                  )}
                  {origin && (
                    <p className="flex items-center gap-1 text-xs text-primary">
                      <CornerDownLeft className="size-3 shrink-0" aria-hidden />
                      منقول من حصة سابقة: {dateOf(origin.program.sessionId)} — {workStatusLabel[origin.item.status]}
                    </p>
                  )}
                  {copies.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowLeftRight className="size-3 shrink-0" aria-hidden />
                      نُقل إلى حصة {copies.map((c) => dateOf(c.program.sessionId)).join("، ")}
                    </p>
                  )}
                  {(isTransferable(item.status) || item.type === "RECITATION") && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {isTransferable(item.status) && (
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
