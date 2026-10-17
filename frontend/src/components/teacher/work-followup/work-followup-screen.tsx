"use client"

import { ClipboardList, FlaskConical, Plus, SearchX } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { todayInTunis } from "@/lib/dates"
import { buildWorkFollowupMock } from "@/lib/mock/work-followup"
import { cn } from "@/lib/utils"
import { newWorkId, phaseOf, programOf, progressOf, sessionLabel } from "@/lib/work-followup"
import type { ID } from "@/types/domain"
import type { WorkItem, WorkProgram } from "@/types/work-followup"

import { WorkEvaluationSheet } from "./work-evaluation-sheet"
import { WorkProgramCard } from "./work-program-card"
import { WorkProgramForm } from "./work-program-form"
import { WorkScheduleDialog, type ScheduleMode } from "./work-schedule-dialog"

type Period = "all" | "upcoming" | "past"
type ProgramState = "pending" | "unfinished" | "done"

const PERIODS: [Period, string][] = [
  ["all", "الكل"],
  ["upcoming", "الحصص القادمة"],
  ["past", "الحصص السابقة"],
]

/**
 * «متابعة العمل» — CLIENT DEMONSTRATION PROTOTYPE. Mock data and React
 * state only: nothing is sent to the API and a refresh resets everything.
 * Student → session → one work program → its work items.
 */
export function WorkFollowupScreen() {
  const today = todayInTunis()
  const [data, setData] = useState(() => buildWorkFollowupMock(today))
  const [query, setQuery] = useState("")
  const [studentId, setStudentId] = useState(ALL)
  const [classId, setClassId] = useState(ALL)
  const [sessionId, setSessionId] = useState(ALL)
  const [state, setState] = useState(ALL)
  const [period, setPeriod] = useState<Period>("all")
  const [form, setForm] = useState<{ key: number; open: boolean; program?: WorkProgram } | null>(null)
  // `key` remounts a sheet / dialog on each opening (fresh draft), never while it closes
  const [evaluating, setEvaluating] = useState<{ key: number; open: boolean; program: WorkProgram } | null>(null)
  const [scheduling, setScheduling] = useState<{ key: number; open: boolean; mode: ScheduleMode; item: WorkItem; source: WorkProgram } | null>(null)

  const studentsById = new Map(data.students.map((s) => [s.id, s]))
  const classesById = new Map(data.classes.map((c) => [c.id, c]))
  const sessionsById = new Map(data.sessions.map((s) => [s.id, s]))

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
          (state === "done" && p.completed === p.total))
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

  const openForm = (program?: WorkProgram) => setForm((f) => ({ key: (f?.key ?? 0) + 1, open: true, program }))
  const closeForm = () => setForm((f) => (f ? { ...f, open: false } : f))

  function saveProgram(program: WorkProgram) {
    const exists = data.programs.some((p) => p.id === program.id)
    setData((d) => ({ ...d, programs: exists ? d.programs.map((p) => (p.id === program.id ? program : p)) : [...d.programs, program] }))
    toast.success(exists ? "تم تحديث برنامج العمل" : "تم حفظ برنامج العمل")
    closeForm()
  }

  function saveEvaluation(program: WorkProgram) {
    setData((d) => ({ ...d, programs: d.programs.map((p) => (p.id === program.id ? program : p)) }))
    const { completed, total } = progressOf(program)
    toast.success("تم حفظ التقييم", { description: `${completed} من ${total} أعمال منجزة` })
    setEvaluating((e) => (e ? { ...e, open: false } : e))
  }

  /** Appends the new item to the student's program of the target session (created if needed). */
  function schedule(targetSessionId: ID, fields: Omit<WorkItem, "id">) {
    if (!scheduling) return
    const { source, mode } = scheduling
    const newItem: WorkItem = { id: newWorkId("wf-item"), ...fields }
    const existing = programOf(data.programs, source.studentId, targetSessionId)
    setData((d) => ({
      ...d,
      programs: existing
        ? d.programs.map((p) => (p.id === existing.id ? { ...p, items: [...p.items, newItem], lastEditedBy: d.me } : p))
        : [...d.programs, { id: newWorkId("wf-p"), studentId: source.studentId, sessionId: targetSessionId, items: [newItem], lastEditedBy: d.me }],
    }))
    const target = sessionsById.get(targetSessionId)
    toast.success(mode === "carry" ? "تم نقل العمل إلى الحصة القادمة" : "تمت إضافة العرضة التالية", {
      description: target ? `${sessionLabel(target)}${existing ? " — أُضيف إلى البرنامج الموجود" : " — برنامج جديد"}` : undefined,
    })
    setScheduling((s) => (s ? { ...s, open: false } : s))
  }

  const evaluated = evaluating && {
    student: studentsById.get(evaluating.program.studentId)!,
    session: sessionsById.get(evaluating.program.sessionId)!,
  }

  return (
    <>
      <PageHeader
        title="متابعة العمل"
        description="تخطيط ومتابعة أعمال الطلبة في كل حصة"
        actions={
          <Button onClick={() => openForm()}>
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
            { value: "done" satisfies ProgramState, label: "كل الأعمال منجزة" },
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
                <Button onClick={() => openForm()}>
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
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map(({ program, student, session, klass, phase }) => (
            <WorkProgramCard
              key={program.id}
              program={program}
              student={student}
              klass={klass}
              session={session}
              phase={phase}
              programs={data.programs}
              sessionsById={sessionsById}
              onEdit={() => openForm(program)}
              onEvaluate={() => setEvaluating((e) => ({ key: (e?.key ?? 0) + 1, open: true, program }))}
              onCarry={(item) => setScheduling((s) => ({ key: (s?.key ?? 0) + 1, open: true, mode: "carry", item, source: program }))}
              onNextRecitation={(item) => setScheduling((s) => ({ key: (s?.key ?? 0) + 1, open: true, mode: "next", item, source: program }))}
            />
          ))}
        </div>
      )}

      {form && (
        <WorkProgramForm
          key={form.key}
          open={form.open}
          onOpenChange={(open) => !open && closeForm()}
          data={data}
          today={today}
          program={form.program}
          onSave={saveProgram}
          onOpenExisting={(program) => openForm(program)}
        />
      )}

      {evaluating && evaluated && (
        <WorkEvaluationSheet
          key={evaluating.key}
          open={evaluating.open}
          onOpenChange={(open) => !open && setEvaluating((e) => (e ? { ...e, open: false } : e))}
          program={evaluating.program}
          student={evaluated.student}
          klass={classesById.get(evaluated.student.groupClassId)}
          session={evaluated.session}
          me={data.me}
          onSave={saveEvaluation}
        />
      )}

      {scheduling && (
        <WorkScheduleDialog
          key={scheduling.key}
          open={scheduling.open}
          onOpenChange={(open) => !open && setScheduling((s) => (s ? { ...s, open: false } : s))}
          mode={scheduling.mode}
          item={scheduling.item}
          source={scheduling.source}
          data={data}
          today={today}
          onConfirm={schedule}
        />
      )}
    </>
  )
}
