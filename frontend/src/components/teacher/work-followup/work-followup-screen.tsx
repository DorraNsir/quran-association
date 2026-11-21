"use client"

import { ArrowDownWideNarrow, ClipboardList, Info, ListOrdered, Plus, SearchX } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { Button } from "@/components/ui/button"
import { workloadSections, WORKLOAD_ORDER } from "@/lib/quran-reference/work-assignment"
import { useWorkPrograms, useWorkSessionOptions, type WorkProgramFilters } from "@/lib/api/work-followup"
import { todayInTunis } from "@/lib/dates"
import { usePlatformSettings } from "@/lib/store/settings"
import { cn } from "@/lib/utils"
import { phaseOf, sessionLabel } from "@/lib/work-followup"

import { useWorkFollowup } from "./work-followup-provider"
import { WorkProgramRow } from "./work-program-row"

type Period = "all" | "upcoming" | "past"
type ProgramState = NonNullable<WorkProgramFilters["state"]>

const PERIODS: [Period, string][] = [
  ["all", "الكل"],
  ["upcoming", "الحصص القادمة"],
  ["past", "الحصص السابقة"],
]

/**
 * «متابعة العمل»: the teacher's work programs (the API returns only those of
 * sessions they teach), filtered and paginated on the server. Compact rows:
 * one per student and session; the full program is on its own page.
 * «ترتيب حسب البرنامج»: on request only, for one selected session — the
 * server orders the whole session (advisory, never a rank); the teacher's
 * choice holds across pages and refreshes until «الترتيب الأصلي».
 */
export function WorkFollowupScreen() {
  const { students, classes, openCreate, openEdit, openEvaluate } = useWorkFollowup()
  const today = todayInTunis()
  const pageSize = usePlatformSettings().defaultPageSize
  const [query, setQuery] = useState("")
  const [studentId, setStudentId] = useState(ALL)
  const [classId, setClassId] = useState(ALL)
  const [sessionId, setSessionId] = useState(ALL)
  const [state, setState] = useState(ALL)
  const [period, setPeriod] = useState<Period>("all")
  const [page, setPage] = useState(1)
  const [order, setOrder] = useState<"original" | "workload">("original")
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  const filters: WorkProgramFilters = {
    q: query.trim() || undefined,
    studentId: studentId === ALL ? undefined : studentId,
    groupClassId: classId === ALL ? undefined : classId,
    sessionId: sessionId === ALL ? undefined : sessionId,
    period: period === "all" ? undefined : period,
    state: state === ALL ? undefined : (state as ProgramState),
    // Only with a session: without one, the usual order
    order: order === "workload" && sessionId !== ALL ? "workload" : undefined,
  }
  const ordered = filters.order === "workload"
  const list = useWorkPrograms(filters, page, pageSize)
  const sessions = useWorkSessionOptions()
  const programs = list.data?.data ?? []
  const total = list.data?.meta.total ?? 0

  const sessionOptions = (sessions.data ?? [])
    .filter((s) => classId === ALL || s.groupClassId === classId)
    .map((s) => ({ value: s.id, label: `${s.groupName} · ${sessionLabel(s)}` }))

  const hasActiveFilters = Boolean(query) || period !== "all" || [studentId, classId, sessionId, state].some((v) => v !== ALL)
  const resetFilters = () => {
    setQuery("")
    setStudentId(ALL)
    setClassId(ALL)
    setSessionId(ALL)
    setState(ALL)
    setPeriod("all")
    setOrder("original")
    setPage(1)
  }
  const chooseOrder = (next: "original" | "workload") => {
    setOrder(next)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="متابعة العمل"
        description="تخطيط ومتابعة أعمال الطلبة في كل حصة"
        actions={
          <Button onClick={openCreate}>
            <Plus />
            إضافة برنامج عمل
          </Button>
        }
      />

      <div role="tablist" aria-label="الفترة" className="mb-4 inline-flex rounded-lg border bg-card p-1">
        {PERIODS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={period === value}
            onClick={() => reset(setPeriod)(value)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm transition-colors",
              period === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        resultLabel={`${total} برنامج عمل`}
        search={<SearchInput value={query} onChange={reset(setQuery)} label="البحث عن طالب" placeholder="ابحث عن طالب…" />}
      >
        <FilterSelect
          label="القسم"
          allLabel="كل الأقسام"
          value={classId}
          onValueChange={(v) => {
            setClassId(v)
            setStudentId(ALL)
            setSessionId(ALL)
            setOrder("original")
            setPage(1)
          }}
          options={classes.map((c) => ({ value: c.id, label: c.label }))}
        />
        <FilterSelect
          label="الطالب"
          allLabel="كل الطلبة"
          value={studentId}
          onValueChange={reset(setStudentId)}
          options={students
            .filter((s) => classId === ALL || s.groupClassId === classId)
            .map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))}
        />
        <FilterSelect
          label="الحصة"
          allLabel="كل الحصص"
          value={sessionId}
          onValueChange={(v) => {
            // another session is never reordered without being asked
            setSessionId(v)
            setOrder("original")
            setPage(1)
          }}
          options={sessionOptions}
        />
        <FilterSelect
          label="حالة البرنامج"
          allLabel="كل الحالات"
          value={state}
          onValueChange={reset(setState)}
          options={[
            { value: "pending" satisfies ProgramState, label: "بانتظار التقييم" },
            { value: "unfinished" satisfies ProgramState, label: "به أعمال غير مكتملة" },
            { value: "cancelled" satisfies ProgramState, label: "به أعمال ملغاة" },
            { value: "done" satisfies ProgramState, label: "كل الأعمال النشطة منجزة" },
          ]}
        />
      </FilterBar>

      <OrderControl
        order={ordered ? "workload" : "original"}
        sessionChosen={sessionId !== ALL}
        onChange={chooseOrder}
      />

      <QueryState query={list}>
        {programs.length === 0 ? (
          <div className="rounded-xl border bg-card">
            {hasActiveFilters ? (
              <EmptyState icon={SearchX} title="لا توجد برامج مطابقة" description="غيّر عوامل التصفية لعرض برامج أخرى." />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="لا توجد برامج عمل بعد"
                description="أضف برنامج عمل لطالب في إحدى حصصه القادمة."
                action={
                  <Button onClick={openCreate}>
                    <Plus />
                    إضافة برنامج عمل
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {workloadSections(programs, ordered).map((section) => (
              <section key={section.key} aria-label={section.label ?? undefined} className="overflow-hidden rounded-xl border bg-card">
                {section.label && (
                  <p className="border-b bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground" data-section={section.kind}>
                    <span className="font-medium text-foreground">{section.label}</span>
                    {section.hint && ` — ${section.hint}`}
                  </p>
                )}
                <ol className="divide-y">
                  {section.programs.map((program) => (
                    <WorkProgramRow
                      key={program.id}
                      program={program}
                      phase={phaseOf(program.session, today)}
                      showSession={sessionId === ALL}
                      onEdit={() => openEdit(program)}
                      onEvaluate={() => openEvaluate(program)}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>
    </>
  )
}

/** «الترتيب الأصلي» | «ترتيب حسب البرنامج» — on request, for one chosen session. */
function OrderControl({
  order,
  sessionChosen,
  onChange,
}: {
  order: "original" | "workload"
  sessionChosen: boolean
  onChange: (order: "original" | "workload") => void
}) {
  const choices: ["original" | "workload", string, typeof ListOrdered][] = [
    ["original", WORKLOAD_ORDER.original, ListOrdered],
    ["workload", WORKLOAD_ORDER.workload, ArrowDownWideNarrow],
  ]
  return (
    <div className="mb-4 space-y-1.5">
      <div role="radiogroup" aria-label="ترتيب الطلبة" className="inline-flex rounded-lg border bg-card p-1">
        {choices.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={order === value}
            disabled={value === "workload" && !sessionChosen}
            onClick={() => onChange(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              order === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      {order === "workload" ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground" role="status">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">{WORKLOAD_ORDER.active}</span> — {WORKLOAD_ORDER.explanation}
          </span>
        </p>
      ) : (
        !sessionChosen && <p className="text-xs text-muted-foreground">{WORKLOAD_ORDER.needsSession}</p>
      )}
    </div>
  )
}
