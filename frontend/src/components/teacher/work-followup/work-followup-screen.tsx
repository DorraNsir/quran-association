"use client"

import { ClipboardList, FlaskConical, Plus, SearchX } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { phaseOf, progressOf, sessionLabel } from "@/lib/work-followup"

import { useWorkFollowup } from "./work-followup-provider"
import { WorkProgramCard } from "./work-program-card"

type Period = "all" | "upcoming" | "past"
type ProgramState = "pending" | "unfinished" | "cancelled" | "done"

const PERIODS: [Period, string][] = [
  ["all", "الكل"],
  ["upcoming", "الحصص القادمة"],
  ["past", "الحصص السابقة"],
]

/**
 * «متابعة العمل» — CLIENT DEMONSTRATION PROTOTYPE (shared mock state, no
 * API). Compact cards: one per student and session; the full program is on
 * its own page.
 */
export function WorkFollowupScreen() {
  const { data, today, studentsById, classesById, sessionsById, openCreate, openEdit, openEvaluate } = useWorkFollowup()
  const [query, setQuery] = useState("")
  const [studentId, setStudentId] = useState(ALL)
  const [classId, setClassId] = useState(ALL)
  const [sessionId, setSessionId] = useState(ALL)
  const [state, setState] = useState(ALL)
  const [period, setPeriod] = useState<Period>("all")

  const rows = data.programs
    .map((program) => {
      const student = studentsById.get(program.studentId)!
      const session = sessionsById.get(program.sessionId)!
      return { program, student, session, klass: classesById.get(student.groupClassId), phase: phaseOf(session, today) }
    })
    .filter(({ program, student, session, phase }) => {
      const p = progressOf(program)
      return (
        (!query.trim() || matchesText(`${student.firstName} ${student.lastName}`, query)) &&
        (studentId === ALL || student.id === studentId) &&
        (classId === ALL || student.groupClassId === classId) &&
        (sessionId === ALL || session.id === sessionId) &&
        (period === "all" || (period === "past" ? phase === "PAST" : phase !== "PAST")) &&
        (state === ALL ||
          (state === "pending" && p.pending > 0) ||
          (state === "unfinished" && p.unfinished > 0) ||
          (state === "cancelled" && p.cancelled > 0) ||
          (state === "done" && p.active > 0 && p.completed === p.active))
      )
    })
    // Upcoming first (soonest first), then the history (most recent first)
    .sort((a, b) => {
      const pa = a.phase === "PAST" ? 1 : 0
      const pb = b.phase === "PAST" ? 1 : 0
      if (pa !== pb) return pa - pb
      const order = a.session.date.localeCompare(b.session.date) || a.session.start.localeCompare(b.session.start)
      return (pa ? -order : order) || a.student.lastName.localeCompare(b.student.lastName, "ar")
    })

  // Sessions that have at least one program (for the session filter)
  const sessionOptions = [...new Set(data.programs.map((p) => p.sessionId))]
    .map((id) => sessionsById.get(id)!)
    .filter((s) => classId === ALL || s.groupClassId === classId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => ({ value: s.id, label: `${classesById.get(s.groupClassId)?.groupName ?? ""} · ${sessionLabel(s)}` }))

  const hasActiveFilters = Boolean(query) || period !== "all" || [studentId, classId, sessionId, state].some((v) => v !== ALL)
  const resetFilters = () => {
    setQuery("")
    setStudentId(ALL)
    setClassId(ALL)
    setSessionId(ALL)
    setState(ALL)
    setPeriod("all")
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

      <Alert className="mb-4 border-primary/30 bg-brand-soft/30">
        <FlaskConical aria-hidden />
        <AlertDescription>نموذج أولي للعرض على الجمعية: البيانات تجريبية ولا تُحفظ، وتعود إلى حالتها الأولى عند تحديث الصفحة.</AlertDescription>
      </Alert>

      <div role="tablist" aria-label="الفترة" className="mb-4 inline-flex rounded-lg border bg-card p-1">
        {PERIODS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={period === value}
            onClick={() => setPeriod(value)}
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
        resultLabel={`${rows.length} برنامج عمل`}
        search={<SearchInput value={query} onChange={setQuery} label="البحث عن طالب" placeholder="ابحث عن طالب…" />}
      >
        <FilterSelect
          label="القسم"
          allLabel="كل الأقسام"
          value={classId}
          onValueChange={(v) => {
            setClassId(v)
            setStudentId(ALL)
            setSessionId(ALL)
          }}
          options={data.classes.map((c) => ({ value: c.id, label: `${c.groupName} — ${c.branchName}` }))}
        />
        <FilterSelect
          label="الطالب"
          allLabel="كل الطلبة"
          value={studentId}
          onValueChange={setStudentId}
          options={data.students
            .filter((s) => classId === ALL || s.groupClassId === classId)
            .map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))}
        />
        <FilterSelect label="الحصة" allLabel="كل الحصص" value={sessionId} onValueChange={setSessionId} options={sessionOptions} />
        <FilterSelect
          label="حالة البرنامج"
          allLabel="كل الحالات"
          value={state}
          onValueChange={setState}
          options={[
            { value: "pending" satisfies ProgramState, label: "بانتظار التقييم" },
            { value: "unfinished" satisfies ProgramState, label: "به أعمال غير مكتملة" },
            { value: "cancelled" satisfies ProgramState, label: "به أعمال ملغاة" },
            { value: "done" satisfies ProgramState, label: "كل الأعمال النشطة منجزة" },
          ]}
        />
      </FilterBar>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card">
          {data.programs.length === 0 ? (
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
          ) : (
            <EmptyState icon={SearchX} title="لا توجد برامج مطابقة" description="غيّر عوامل التصفية لعرض برامج أخرى." />
          )}
        </div>
      ) : (
        // Natural heights: a short card never stretches to match its neighbour
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {rows.map(({ program, student, session, klass, phase }) => (
            <WorkProgramCard
              key={program.id}
              program={program}
              student={student}
              klass={klass}
              session={session}
              phase={phase}
              onEdit={() => openEdit(program)}
              onEvaluate={() => openEvaluate(program)}
            />
          ))}
        </div>
      )}
    </>
  )
}
