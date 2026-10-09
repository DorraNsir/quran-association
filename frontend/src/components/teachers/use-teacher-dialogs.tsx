"use client"

import { Eye, PauseCircle, Pencil, PlayCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { fullName, teacherAssignments, type Lookups } from "@/lib/domain"
import { errorMessage } from "@/lib/api/errors"
import { useSaveTeacher, useSetTeacherStatus } from "@/lib/api/hooks/people"
import type { Teacher } from "@/types/domain"

import { TeacherFormSheet } from "./teacher-form-sheet"

export type TeacherAction = "create" | "edit" | "deactivate" | "activate"

type DialogState = {
  kind: "create" | "edit" | "deactivate"
  teacher?: Teacher
  key: number
  open: boolean
}

export function useTeacherDialogs({ lookups }: { lookups: Lookups }) {
  const [state, setState] = useState<DialogState | null>(null)
  const saveTeacher = useSaveTeacher()
  const setStatus = useSetTeacherStatus()

  const close = (open: boolean) => {
    if (!open) setState((s) => (s ? { ...s, open: false } : s))
  }

  function run(kind: TeacherAction, teacher?: Teacher) {
    if (kind === "activate") {
      if (!teacher) return
      setStatus
        .mutateAsync({ id: teacher.id, status: "ACTIVE" })
        .then(() => toast.success(`تم تفعيل ${fullName(teacher)}`))
        .catch((error: unknown) => toast.error(errorMessage(error)))
      return
    }
    setState({ kind, teacher, key: Date.now(), open: true })
  }


  const teacher = state?.teacher
  const supervised = teacher
    ? teacherAssignments(teacher.id, lookups).filter((a) => a.role === "SUPERVISOR")
    : []

  const dialogs = (
    <>
      {state && (state.kind === "create" || state.kind === "edit") && (
        <TeacherFormSheet
          key={state.key}
          open={state.open}
          onOpenChange={close}
          teacher={teacher}
          lookups={lookups}
          onSave={async (input) => {
            await saveTeacher.mutateAsync({ id: teacher?.id, input })
            toast.success(teacher ? `تم حفظ تعديلات ${fullName(input.person)}` : `تمت إضافة ${fullName(input.person)}`)
            close(false)
          }}
        />
      )}
      {state?.kind === "deactivate" && teacher && (
        <ConfirmDialog
          open={state.open}
          onOpenChange={close}
          title="إيقاف نشاط المعلم؟"
          description={
            supervised.length > 0
              ? `${fullName(teacher)} هو المعلم المشرف على: ${supervised
                  .map((a) => `${a.group?.name ?? ""} (${a.branch?.name ?? ""})`)
                  .join("، ")}. يجب تعيين مشرف بديل لهذه المجموعات بعد الإيقاف.`
              : `سيصبح ${fullName(teacher)} غير نشط ولن يظهر عند تعيين المعلمين في المجموعات.`
          }
          confirmLabel="إيقاف النشاط"
          destructive
          onConfirm={async () => {
            await setStatus.mutateAsync({ id: teacher.id, status: "INACTIVE" })
            toast.success(`تم إيقاف نشاط ${fullName(teacher)}`)
            close(false)
          }}
        />
      )}
    </>
  )

  return { run, dialogs }
}

export function teacherActions(
  teacher: Teacher,
  run: (kind: TeacherAction, teacher: Teacher) => void,
  { includeView = true, includeEdit = true }: { includeView?: boolean; includeEdit?: boolean } = {}
): RowAction[] {
  const actions: RowAction[] = []
  if (includeView) {
    actions.push({ label: "عرض الملف", icon: Eye, href: `/admin/teachers/${teacher.id}` })
  }
  if (includeEdit) {
    actions.push({ label: "تعديل", icon: Pencil, onSelect: () => run("edit", teacher) })
  }
  actions.push(
    teacher.status === "ACTIVE"
      ? {
          label: "إيقاف النشاط",
          icon: PauseCircle,
          destructive: true,
          separated: true,
          onSelect: () => run("deactivate", teacher),
        }
      : {
          label: "إعادة التفعيل",
          icon: PlayCircle,
          separated: true,
          onSelect: () => run("activate", teacher),
        }
  )
  return actions
}
