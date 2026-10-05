"use client"

import { Eye, PauseCircle, Pencil, PlayCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { fullName, teacherAssignments, type Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import type { Teacher } from "@/types/domain"

import { TeacherFormSheet } from "./teacher-form-sheet"

export type TeacherAction = "create" | "edit" | "deactivate" | "activate"

type DialogState = {
  kind: "create" | "edit" | "deactivate"
  teacher?: Teacher
  key: number
  open: boolean
}

const mockSaved = { description: labels.common.mockNotice }

export function useTeacherDialogs({
  lookups,
  onChange,
}: {
  lookups: Lookups
  onChange?: (teacher: Teacher, isNew: boolean) => void
}) {
  const [state, setState] = useState<DialogState | null>(null)

  const close = (open: boolean) => {
    if (!open) setState((s) => (s ? { ...s, open: false } : s))
  }

  function run(kind: TeacherAction, teacher?: Teacher) {
    if (kind === "activate") {
      if (!teacher) return
      onChange?.({ ...teacher, status: "ACTIVE" }, false)
      toast.success(`تم تفعيل ${fullName(teacher)}`, mockSaved)
      return
    }
    setState({ kind, teacher, key: Date.now(), open: true })
  }

  function commit(teacher: Teacher, message: string, isNew = false) {
    onChange?.(teacher, isNew)
    toast.success(message, mockSaved)
    close(false)
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
          onSave={(saved) =>
            commit(
              saved,
              teacher ? `تم حفظ تعديلات ${fullName(saved)}` : `تمت إضافة ${fullName(saved)}`,
              !teacher
            )
          }
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
          onConfirm={() =>
            commit({ ...teacher, status: "INACTIVE" }, `تم إيقاف نشاط ${fullName(teacher)}`)
          }
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
