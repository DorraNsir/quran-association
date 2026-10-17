"use client"

import { ClipboardList, Plus, SearchX } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { Button } from "@/components/ui/button"
import { useWorkPrograms, useWorkSessionOptions, type WorkProgramFilters } from "@/lib/api/work-followup"
import { todayInTunis } from "@/lib/dates"
import { usePlatformSettings } from "@/lib/store/settings"
import { cn } from "@/lib/utils"
import { phaseOf, sessionLabel } from "@/lib/work-followup"

import { useWorkFollowup } from "./work-followup-provider"
import { WorkProgramCard } from "./work-program-card"

type Period = "all" | "upcoming" | "past"
type ProgramState = NonNullable<WorkProgramFilters["state"]>

const PERIODS: [Period, string][] = [
  ["all", "الكل"],
  ["upcoming", "الحصص القادمة"],
  ["past", "الحصص السابقة"],
]

/**
 * «متابعة العمل»: the teacher's work programs (the API returns only those of
 * sessions they teach), filtered and paginated on the server. Compact cards:
 * one per student and session; the full program is on its own page.
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
  }
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
        <FilterSelect label="الحصة" allLabel="كل الحصص" value={sessionId} onValueChange={reset(setSessionId)} options={sessionOptions} />
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
          // Natural heights: a short card never stretches to match its neighbour
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {programs.map((program) => (
              <WorkProgramCard
                key={program.id}
                program={program}
                phase={phaseOf(program.session, today)}
                onEdit={() => openEdit(program)}
                onEvaluate={() => openEvaluate(program)}
              />
            ))}
          </div>
        )}
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>
    </>
  )
}
