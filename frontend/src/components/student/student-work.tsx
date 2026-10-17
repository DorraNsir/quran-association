"use client"

import { ClipboardList, CornerDownLeft, MessageSquareText, UserRound } from "lucide-react"
import { useState } from "react"

import { WorkStatusBadge, WorkTypeBadge } from "@/components/teacher/work-followup/work-badges"
import { ProgramProgress, SessionLine, WRAP } from "@/components/teacher/work-followup/work-program-card"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { Card } from "@/components/ui/card"
import { useMyWorkPrograms } from "@/lib/api/work-followup"
import { todayInTunis } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { usePlatformSettings } from "@/lib/store/settings"
import { cn } from "@/lib/utils"
import { phaseOf, workStatusLabel } from "@/lib/work-followup"
import type { StudentWorkProgram } from "@/types/work-followup"

type Period = "upcoming" | "past" | "all"

const PERIODS: [Period, string][] = [
  ["upcoming", "الأعمال القادمة"],
  ["past", "الأعمال السابقة"],
  ["all", "الكل"],
]

/**
 * «متابعة العمل» in the Student Space: the work my teachers planned for me,
 * session by session, with their results — read-only (the API offers no
 * change to students). Upcoming work first; history on its own tab.
 */
export function StudentWorkScreen() {
  const today = todayInTunis()
  const pageSize = usePlatformSettings().defaultPageSize
  const [period, setPeriod] = useState<Period>("upcoming")
  const [page, setPage] = useState(1)
  const query = useMyWorkPrograms(period === "all" ? undefined : period, page, pageSize)
  const programs = query.data?.data ?? []

  return (
    <>
      <PageHeader title="متابعة العمل" description="الأعمال التي يحدّدها لك معلموك في كل حصة، ونتيجة تقييمها." />

      <div role="tablist" aria-label="الفترة" className="mb-4 inline-flex rounded-lg border bg-card p-1">
        {PERIODS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={period === value}
            onClick={() => {
              setPeriod(value)
              setPage(1)
            }}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm transition-colors",
              period === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <QueryState query={query}>
        {programs.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon={ClipboardList}
              title={period === "upcoming" ? "لا توجد أعمال قادمة" : period === "past" ? "لا توجد أعمال سابقة" : "لا توجد أعمال بعد"}
              description={period === "upcoming" ? "ستظهر هنا الأعمال التي يحدّدها معلمك لحصصك القادمة." : undefined}
            />
          </div>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {programs.map((program) => (
              <StudentWorkCard key={program.id} program={program} phase={phaseOf(program.session, today)} />
            ))}
          </div>
        )}
        <Pager page={page} totalPages={query.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>
    </>
  )
}

/** One session's work: when, who planned it, every item and its result — nothing to click. */
function StudentWorkCard({ program, phase }: { program: StudentWorkProgram; phase: ReturnType<typeof phaseOf> }) {
  const { session } = program
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <SessionLine session={session} phase={phase} />
          <p className="text-xs text-muted-foreground">
            {session.groupName} — {session.branchName}
          </p>
          {program.teacherName && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <UserRound className="size-3.5" aria-hidden />
              المعلم: {program.teacherName}
            </p>
          )}
        </div>
        <ProgramProgress progress={program.progress} className="sm:w-48 sm:shrink-0" />
      </div>
      <ol className="divide-y">
        {program.items.map((item) => (
          <li key={item.id} className="space-y-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber ?? undefined} />
              <WorkStatusBadge status={item.status} />
            </div>
            {/* The full text: line breaks and very long words wrap inside the card */}
            <p className={cn("text-sm whitespace-pre-wrap", WRAP)}>{item.description}</p>
            {item.evaluationComment && (
              <p className={cn("flex items-start gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap", WRAP)}>
                <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium text-foreground">تعليق المعلم: </span>
                  {item.evaluationComment}
                </span>
              </p>
            )}
            {item.carriedFrom && (
              <p className="flex items-center gap-1 text-xs text-primary">
                <CornerDownLeft className="size-3 shrink-0" aria-hidden />
                منقول من حصة {formatDate(item.carriedFrom.sessionDate)} — {workStatusLabel[item.carriedFrom.status]}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  )
}
