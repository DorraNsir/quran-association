"use client"

import { useQueryClient } from "@tanstack/react-query"
import { createContext, useContext, useState } from "react"
import { toast } from "sonner"

import { api } from "@/lib/api/client"
import { errorMessage } from "@/lib/api/errors"
import { workKeys } from "@/lib/api/work-followup"
import { useTeacherWorkspace } from "@/lib/api/workspace"
import { describeClass, indexLookups } from "@/lib/domain"
import type { ID } from "@/types/domain"
import type { WorkItem, WorkProgram } from "@/types/work-followup"

import { WorkEvaluationSheet } from "./work-evaluation-sheet"
import { WorkProgramForm } from "./work-program-form"
import { WorkScheduleDialog, type ScheduleMode } from "./work-schedule-dialog"

/** A student the teacher may plan work for (a current, active student of their classes). */
export interface WorkStudentOption {
  id: ID
  firstName: string
  lastName: string
  groupClassId: ID
}
export interface WorkClassOption {
  id: ID
  label: string
}

interface WorkFollowupContextValue {
  /** The teacher's current classes and their active students (GET /api/teacher/workspace) */
  students: WorkStudentOption[]
  classes: WorkClassOption[]
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
 * «متابعة العمل»: the sheets and dialogs shared by the list and the program
 * page (mounted once by their layout). The data itself is the API's, through
 * React Query: every save refreshes the list, the programs and the options.
 */
export function WorkFollowupProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const workspace = useTeacherWorkspace()
  // `key` remounts a sheet / dialog on each opening (fresh draft), never while it closes
  const [form, setForm] = useState<{ key: number; open: boolean; program?: WorkProgram } | null>(null)
  const [evaluating, setEvaluating] = useState<{ key: number; open: boolean; program: WorkProgram } | null>(null)
  const [scheduling, setScheduling] = useState<{ key: number; open: boolean; mode: ScheduleMode; item: WorkItem; source: WorkProgram } | null>(null)

  const lookups = workspace.data?.lookups
  const indexes = lookups ? indexLookups(lookups) : undefined
  const classes: WorkClassOption[] =
    lookups && indexes
      ? lookups.groupClasses
          .filter((c) => c.status !== "ARCHIVED")
          .map((c) => {
            const view = describeClass(c, indexes)
            return { id: c.id, label: `${view.group?.name ?? "—"} — ${view.branch?.name ?? ""}` }
          })
      : []
  const students: WorkStudentOption[] = (workspace.data?.students ?? [])
    .filter((s) => s.status === "ACTIVE" && s.groupClassId)
    .map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName, groupClassId: s.groupClassId! }))

  const openForm = (program?: WorkProgram) => setForm((f) => ({ key: (f?.key ?? 0) + 1, open: true, program }))

  /** «تعديل البرنامج الموجود» from the create form: load it, then edit it. */
  async function openExisting(programId: string) {
    try {
      const program = await queryClient.fetchQuery({
        queryKey: workKeys.one(programId),
        queryFn: ({ signal }) => api<WorkProgram>(`/teacher/work-programs/${programId}`, { signal }),
      })
      openForm(program)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const value: WorkFollowupContextValue = {
    students,
    classes,
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
          onOpenChange={(open) => !open && setForm((f) => (f ? { ...f, open: false } : f))}
          students={students}
          classes={classes}
          program={form.program}
          onOpenExisting={openExisting}
        />
      )}

      {evaluating && (
        <WorkEvaluationSheet
          key={evaluating.key}
          open={evaluating.open}
          onOpenChange={(open) => !open && setEvaluating((e) => (e ? { ...e, open: false } : e))}
          program={evaluating.program}
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
        />
      )}
    </WorkFollowupContext.Provider>
  )
}
