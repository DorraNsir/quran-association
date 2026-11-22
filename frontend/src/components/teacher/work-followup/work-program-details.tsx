"use client"

import {
  ArrowLeftRight,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CornerDownLeft,
  Layers,
  Mic,
  NotebookText,
  Pencil,
  UserRound,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react"
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
import { completionParts, completionText, PERFORMANCE_LABEL } from "@/lib/quran-reference/work-assignment"
import { cn } from "@/lib/utils"
import { carriedFromLabel, evaluationBlockMessage, isTransferable, phaseOf, workStatusLabel } from "@/lib/work-followup"
import type { WorkItem, WorkItemLink, WorkProgram } from "@/types/work-followup"

import { OverallEvaluationSection } from "./overall-evaluation"
import { RecitationHistoryRow } from "./recitation-line"
import { ownDescription, WorkAssignmentView } from "./work-assignment-view"
import { LEVEL_LOOK, WORK_STATUS_STYLE, WorkStatusBadge, WorkTypeBadge } from "./work-badges"
import { useWorkFollowup } from "./work-followup-provider"
import { programHref, SessionLine, WRAP } from "./work-program-card"

const BACK = "/teacher/work-followup"

/**
 * «تفاصيل برنامج العمل» (from the API) — the mobile screen's design, laid out for the desktop:
 *   summary  the student (photo, name, class, session), the overall level, and «ملخص الأعمال» —
 *            one counter per result present, EVERY item counted (never «all done» with dropped work);
 *   items    one card each, in full: kind and result, the range and its size, evaluator and date,
 *            the evaluation notes, the recitation history, links to the other programs and actions;
 *   then     «التقييم العام» and the teacher notes.
 * The same sheets / dialogs as the list. A program the teacher may not see (another class, a
 * session they did not teach) is "not found" for them.
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
  const { student, session } = program
  const name = `${student.firstName} ${student.lastName}`
  const level = program.overallEvaluation?.level ?? null
  const LevelIcon = level ? LEVEL_LOOK[level].icon : null
  const statuses = program.items.map((i) => i.status)
  const parts = completionParts(statuses)

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ms-2 text-muted-foreground">
        <Link href={BACK}>
          <ChevronRight />
          العودة إلى متابعة العمل
        </Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">تفاصيل برنامج العمل</h1>
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

      <Card className="mb-6 gap-0 p-0">
        <div className="flex items-start gap-4 p-5">
          <UserAvatar name={name} photoUrl={student.photoUrl ?? undefined} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className={cn("text-lg font-semibold", WRAP)}>{name}</h2>
            <p className="text-sm text-muted-foreground">
              {session.groupName} — {session.branchName}
            </p>
            <SessionLine session={session} phase={phaseOf(session, today)} />
          </div>
          {level && LevelIcon && (
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", LEVEL_LOOK[level].tone)} data-summary-overall={level}>
              <LevelIcon className="size-4" aria-hidden />
              {PERFORMANCE_LABEL[level]}
            </span>
          )}
        </div>
        {blocked && (
          <p id="wf-eval-blocked" role="status" className="border-t bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
            {evaluationBlockMessage[blocked]}
          </p>
        )}
        <section aria-labelledby="wf-summary" className="space-y-3 border-t p-5">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" aria-hidden />
            <h3 id="wf-summary" className="flex-1 text-sm font-semibold">
              ملخص الأعمال
            </h3>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{itemsTotal(program.items.length)}</span>
          </div>
          {parts.length > 0 ? (
            // Every item counted — «1 منجز · 1 ملغى», never «all done» when some were dropped
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label={`ملخص الأعمال: ${completionText(statuses)}`} data-items-summary>
              {parts.map((part) => {
                const { icon: Icon, badge } = WORK_STATUS_STYLE[part.status]
                return (
                  <li
                    key={part.status}
                    data-summary={part.status}
                    className={cn("flex flex-col items-center gap-0.5 rounded-lg px-3 py-2", badge, part.status === "NOT_EVALUATED" && "border-0 bg-muted")}
                  >
                    <span className="inline-flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                      <Icon className="size-4" aria-hidden />
                      {part.count}
                    </span>
                    <span className="text-xs">{part.label}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد أعمال</p>
          )}
        </section>
      </Card>

      <section aria-labelledby="wf-items" className="space-y-3">
        <h2 id="wf-items" className="text-base font-semibold">
          الأعمال <span className="text-sm font-normal text-muted-foreground">({program.items.length})</span>
        </h2>
        <ol className="space-y-3">
          {program.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              program={program}
              onCarry={() => openSchedule("carry", item, program)}
              onNext={() => openSchedule("next", item, program)}
            />
          ))}
        </ol>
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

        {program.lastEditedBy && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <UserRoundPen className="size-3.5" aria-hidden />
            آخر تعديل بواسطة: {program.lastEditedBy}
          </p>
        )}
      </section>
    </>
  )
}

/** «عمل واحد» / «عملان» / «3 أعمال» / «11 عملًا» */
const itemsTotal = (n: number) => (n === 1 ? "عمل واحد" : n === 2 ? "عملان" : `${n} ${n <= 10 ? "أعمال" : "عملًا"}`)

const dates = (links: WorkItemLink[]) => links.map((l) => formatDate(l.sessionDate)).join("، ")

/** One work item in full (a details page: nothing useful is dropped to make it smaller). */
function ItemCard({ item, program, onCarry, onNext }: { item: WorkItem; program: WorkProgram; onCarry: () => void; onNext: () => void }) {
  const note = ownDescription(item)
  const transferable = isTransferable(item.status, program.session.status)
  const recitation = item.type === "RECITATION"
  return (
    <li>
      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber ?? undefined} size="lg" />
          <WorkStatusBadge status={item.status} size="lg" />
        </div>

        {/* Complete description: paragraphs, line breaks and unbroken strings all wrap */}
        {item.assignment && <WorkAssignmentView type={item.type} assignment={item.assignment} workload={item.workload} />}
        {/* Legacy free text as written; for a structured item, only the teacher's own note */}
        {note && (
          <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", WRAP, item.assignment ? "text-muted-foreground" : "font-medium")}>{note}</p>
        )}

        {item.evaluatedBy && item.evaluatedAt && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" data-evaluated>
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3.5" aria-hidden />
              <span className="sr-only">قيّمه </span>
              {item.evaluatedBy}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />
              {formatDate(item.evaluatedAt.slice(0, 10))}
            </span>
          </p>
        )}

        {item.evaluationComment && (
          <div className="space-y-0.5 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <NotebookText className="size-3.5 text-muted-foreground" aria-hidden />
              ملاحظات التقييم
            </p>
            <p className={cn("whitespace-pre-wrap text-muted-foreground", WRAP)}>{item.evaluationComment}</p>
          </div>
        )}

        {/* «سجل العرضات»: this surah's recitations, opening its full history (none for a legacy عرضة) */}
        {item.recitation && <RecitationHistoryRow recitation={item.recitation} studentId={program.student.id} />}

        {item.carriedFrom && (
          // The source's status WHEN it was carried (kept by the API)
          <LinkRow
            icon={CornerDownLeft}
            href={programHref(item.carriedFrom.programId)}
            title={item.carriedFrom.status === "NOT_EVALUATED" ? "منقول من حصة ملغاة" : "منقول من حصة سابقة"}
            detail={
              item.carriedFrom.status === "NOT_EVALUATED"
                ? formatDate(item.carriedFrom.sessionDate)
                : `${formatDate(item.carriedFrom.sessionDate)} — ${workStatusLabel[item.carriedFrom.status]}`
            }
            label={carriedFromLabel(item.carriedFrom)}
          />
        )}
        {item.continuedFrom && (
          <LinkRow
            icon={Mic}
            href={programHref(item.continuedFrom.programId)}
            title="العرضة السابقة"
            detail={formatDate(item.continuedFrom.sessionDate)}
            label={`تلي عرضة حصة ${formatDate(item.continuedFrom.sessionDate)}`}
          />
        )}
        {item.carriedTo.length > 0 && (
          <LinkRow
            icon={ArrowLeftRight}
            href={programHref(item.carriedTo[0]!.programId)}
            title="نُقل إلى حصة"
            detail={dates(item.carriedTo)}
            label={`نُقل إلى حصة ${dates(item.carriedTo)}`}
          />
        )}
        {item.continuedBy.length > 0 && (
          <LinkRow
            icon={CalendarCheck}
            brand
            href={programHref(item.continuedBy[0]!.programId)}
            title="العرضة القادمة"
            detail={`مجدولة في ${dates(item.continuedBy)}`}
            label={`العرضة التالية مبرمجة في حصة ${dates(item.continuedBy)}`}
          />
        )}

        {(transferable || recitation) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {/* Primary actions stay green (the app's colour): purple only marks the عرضة type */}
            {recitation && (
              <Button size="sm" onClick={onNext}>
                <Mic />
                إضافة العرضة التالية
              </Button>
            )}
            {transferable && (
              <Button variant="outline" size="sm" onClick={onCarry}>
                <ArrowLeftRight />
                نقل إلى الحصة القادمة
              </Button>
            )}
          </div>
        )}
      </Card>
    </li>
  )
}

/** A link to the other program of a carried / continued item: title · detail; the whole row opens it. */
function LinkRow({ icon: Icon, href, title, detail, label, brand }: { icon: LucideIcon; href: string; title: string; detail: string; label: string; brand?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title="فتح البرنامج المرتبط"
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        brand ? "bg-brand-soft hover:bg-brand-soft/70" : "bg-muted/60 hover:bg-muted"
      )}
    >
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="font-medium">{title}</span>
      <span className="flex-1" />
      <span className="text-xs text-muted-foreground">{detail}</span>
      <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}
