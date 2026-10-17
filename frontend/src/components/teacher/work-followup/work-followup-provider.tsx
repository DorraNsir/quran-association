"use client"

import { createContext, useContext, useState } from "react"
import { toast } from "sonner"

import { todayInTunis } from "@/lib/dates"
import { buildWorkFollowupMock } from "@/lib/mock/work-followup"
import { newWorkId, progressLabel, progressOf, programOf, sessionLabel } from "@/lib/work-followup"
import type { ID, ISODate } from "@/types/domain"
import type { MockClass, MockSession, MockStudent, WorkFollowupData, WorkItem, WorkProgram } from "@/types/work-followup"

import { WorkEvaluationSheet } from "./work-evaluation-sheet"
import { WorkProgramForm } from "./work-program-form"
import { WorkScheduleDialog, type ScheduleMode } from "./work-schedule-dialog"

interface WorkFollowupContextValue {
  data: WorkFollowupData
  today: ISODate
  studentsById: Map<ID, MockStudent>
  classesById: Map<ID, MockClass>
  sessionsById: Map<ID, MockSession>
  openCreate: () => void
  openEdit: (program: WorkProgram) => void
  openEvaluate: (program: WorkProgram) => void
  openSchedule: (mode: ScheduleMode, item: WorkItem, source: WorkProgram) => void
}

const WorkFollowupContext = createContext<WorkFollowupContextValue | null>(null)

export function useWorkFollowup() {
  const value = useContext(WorkFollowupContext)
  if (!value) throw new Error("useWorkFollowup must be used inside <WorkFollowupProvider>")
  return value
}

/**
 * «متابعة العمل» — the ONE prototype state shared by the list and the
 * details pages (mounted by their common layout, so it survives navigation
 * between them; a browser refresh resets it — no API, no persistence). It
 * also owns the sheets and dialogs, so both pages run the same logic.
 */
export function WorkFollowupProvider({ children }: { children: React.ReactNode }) {
  const today = todayInTunis()
  const [data, setData] = useState(() => buildWorkFollowupMock(today))
  // `key` remounts a sheet / dialog on each opening (fresh draft), never while it closes
  const [form, setForm] = useState<{ key: number; open: boolean; program?: WorkProgram } | null>(null)
  const [evaluating, setEvaluating] = useState<{ key: number; open: boolean; program: WorkProgram } | null>(null)
  const [scheduling, setScheduling] = useState<{ key: number; open: boolean; mode: ScheduleMode; item: WorkItem; source: WorkProgram } | null>(null)

  const studentsById = new Map(data.students.map((s) => [s.id, s]))
  const classesById = new Map(data.classes.map((c) => [c.id, c]))
  const sessionsById = new Map(data.sessions.map((s) => [s.id, s]))

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
    toast.success("تم حفظ التقييم", { description: progressLabel(progressOf(program)) })
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

  const evaluatedStudent = evaluating && studentsById.get(evaluating.program.studentId)
  const evaluatedSession = evaluating && sessionsById.get(evaluating.program.sessionId)

  const value: WorkFollowupContextValue = {
    data,
    today,
    studentsById,
    classesById,
    sessionsById,
    openCreate: () => openForm(),
    openEdit: (program) => openForm(program),
    openEvaluate: (program) => setEvaluating((e) => ({ key: (e?.key ?? 0) + 1, open: true, program })),
    openSchedule: (mode, item, source) => setScheduling((s) => ({ key: (s?.key ?? 0) + 1, open: true, mode, item, source })),
  }

  return (
    <WorkFollowupContext.Provider value={value}>
      {children}

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

      {evaluating && evaluatedStudent && evaluatedSession && (
        <WorkEvaluationSheet
          key={evaluating.key}
          open={evaluating.open}
          onOpenChange={(open) => !open && setEvaluating((e) => (e ? { ...e, open: false } : e))}
          program={evaluating.program}
          student={evaluatedStudent}
          klass={classesById.get(evaluatedStudent.groupClassId)}
          session={evaluatedSession}
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
    </WorkFollowupContext.Provider>
  )
}
