"use client"

import { Archive, ArrowLeftRight, Eye, PauseCircle, Pencil, PlayCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { fullName, indexLookups, studentClass, type Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import type { Student } from "@/types/domain"

import { ChangeGroupDialog } from "./change-group-dialog"
import { StudentFormSheet } from "./student-form-sheet"

export type StudentAction = "create" | "edit" | "changeGroup" | "deactivate" | "archive" | "activate"

type DialogState = {
  kind: Exclude<StudentAction, "activate">
  student?: Student
  /** Changes on each open so forms start fresh */
  key: number
  open: boolean
}

const mockSaved = { description: labels.common.mockNotice }

/**
 * Owns the student dialogs (form, change group, confirmations) so the list
 * page and the profile page share one behaviour. `onChange` receives the
 * updated record — the list applies it locally; the profile only confirms.
 */
export function useStudentDialogs({
  lookups,
  onChange,
}: {
  lookups: Lookups
  onChange?: (student: Student, isNew: boolean) => void
}) {
  const [state, setState] = useState<DialogState | null>(null)

  const close = (open: boolean) => {
    if (!open) setState((s) => (s ? { ...s, open: false } : s))
  }

  function run(kind: StudentAction, student?: Student) {
    if (kind === "activate" && student) {
      onChange?.({ ...student, status: "ACTIVE" }, false)
      toast.success(`تم تفعيل ملف ${fullName(student)}`, mockSaved)
      return
    }
    if (kind === "activate") return
    setState({ kind, student, key: Date.now(), open: true })
  }

  function commit(student: Student, message: string, isNew = false) {
    onChange?.(student, isNew)
    toast.success(message, mockSaved)
    close(false)
  }

  const student = state?.student
  const isForm = state?.kind === "create" || state?.kind === "edit"

  const dialogs = (
    <>
      {state && isForm && (
        <StudentFormSheet
          key={state.key}
          open={state.open}
          onOpenChange={close}
          student={student}
          lookups={lookups}
          onSave={(saved) =>
            commit(
              saved,
              student ? `تم حفظ تعديلات ${fullName(saved)}` : `تمت إضافة ${fullName(saved)}`,
              !student
            )
          }
        />
      )}
      {state?.kind === "changeGroup" && student && (
        <ChangeGroupDialog
          key={state.key}
          open={state.open}
          onOpenChange={close}
          student={student}
          lookups={lookups}
          onConfirm={(groupClassId) => {
            const target = studentClass({ groupClassId }, indexLookups(lookups))
            commit(
              { ...student, groupClassId },
              `تم نقل ${fullName(student)} إلى ${target?.group?.name ?? ""} — ${target?.branch?.name ?? ""}`
            )
          }}
        />
      )}
      {(state?.kind === "deactivate" || state?.kind === "archive") && student && (
        <ConfirmDialog
          open={state.open}
          onOpenChange={close}
          destructive={state.kind === "archive"}
          title={state.kind === "archive" ? "أرشفة ملف الطالب؟" : "إيقاف الطالب مؤقتًا؟"}
          description={
            state.kind === "archive"
              ? `سيُنقل ملف ${fullName(student)} إلى الأرشيف ولن يظهر ضمن الطلبة النشطين. يمكن استرجاعه لاحقًا.`
              : `سيصبح ${fullName(student)} غير نشط مع الاحتفاظ بمجموعته وبياناته.`
          }
          confirmLabel={state.kind === "archive" ? "أرشفة" : "إيقاف مؤقت"}
          onConfirm={() =>
            commit(
              { ...student, status: state.kind === "archive" ? "ARCHIVED" : "INACTIVE" },
              state.kind === "archive"
                ? `تمت أرشفة ملف ${fullName(student)}`
                : `تم إيقاف ${fullName(student)} مؤقتًا`
            )
          }
        />
      )}
    </>
  )

  return { run, dialogs }
}

/** Menu actions available for a student, depending on its status. */
export function studentActions(
  student: Student,
  run: (kind: StudentAction, student: Student) => void,
  { includeView = true, includeEdit = true }: { includeView?: boolean; includeEdit?: boolean } = {}
): RowAction[] {
  const actions: RowAction[] = []
  if (includeView) {
    actions.push({ label: "عرض الملف", icon: Eye, href: `/admin/students/${student.id}` })
  }
  if (includeEdit) {
    actions.push({ label: "تعديل", icon: Pencil, onSelect: () => run("edit", student) })
  }
  actions.push({
    label: "تغيير المجموعة",
    icon: ArrowLeftRight,
    onSelect: () => run("changeGroup", student),
  })
  if (student.status === "ACTIVE") {
    actions.push({
      label: "إيقاف مؤقت",
      icon: PauseCircle,
      onSelect: () => run("deactivate", student),
      separated: true,
    })
  } else {
    actions.push({
      label: "إعادة التفعيل",
      icon: PlayCircle,
      onSelect: () => run("activate", student),
      separated: true,
    })
  }
  if (student.status !== "ARCHIVED") {
    actions.push({
      label: "أرشفة",
      icon: Archive,
      destructive: true,
      onSelect: () => run("archive", student),
    })
  }
  return actions
}
