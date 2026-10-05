"use client"

import { Archive, Eye, PauseCircle, Pencil, PlayCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { schedulesOf, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { checkGroupSessions } from "@/lib/scheduling"
import type { Group, Student } from "@/types/domain"

import { GroupFormSheet, type GroupSaveResult } from "./group-form-sheet"

export type GroupAction = "create" | "edit" | "deactivate" | "archive" | "activate"

type DialogState = {
  kind: "create" | "edit" | "deactivate" | "archive"
  group?: Group
  key: number
  open: boolean
}

const mockSaved = { description: labels.common.mockNotice }

export function useGroupDialogs({
  lookups,
  students,
  onChange,
}: {
  lookups: Lookups
  students: Student[]
  onChange?: (result: GroupSaveResult, isNew: boolean) => void
}) {
  const [state, setState] = useState<DialogState | null>(null)

  const close = (open: boolean) => {
    if (!open) setState((s) => (s ? { ...s, open: false } : s))
  }

  const unchanged = (group: Group) => ({
    studentIds: students.filter((s) => s.groupId === group.id).map((s) => s.id),
    schedules: schedulesOf(group.id, lookups.schedules),
  })

  function commit(result: GroupSaveResult, message: string, isNew = false) {
    onChange?.(result, isNew)
    toast.success(message, mockSaved)
    close(false)
  }

  function run(kind: GroupAction, group?: Group) {
    if (kind === "activate") {
      if (!group) return
      const activated: Group = { ...group, status: "ACTIVE" }
      // A paused group's old slots may now collide with other groups
      const drafts = schedulesOf(group.id, lookups.schedules).map((s) => ({ ...s, key: s.id }))
      const blocked = [...checkGroupSessions(drafts, activated, lookups).values()].some(
        (c) => c.conflicts.length > 0
      )
      if (blocked) {
        toast.error(`لا يمكن تفعيل ${group.name} بمواعيدها الحالية`, {
          description: "بعض حصصها تتعارض مع مجموعات أخرى. عدّل المواعيد أولًا.",
        })
        setState({ kind: "edit", group: activated, key: Date.now(), open: true })
        return
      }
      commit({ group: activated, ...unchanged(group) }, `تم تفعيل ${group.name}`)
      return
    }
    setState({ kind, group, key: Date.now(), open: true })
  }

  const group = state?.group
  const memberCount = group
    ? students.filter((s) => s.groupId === group.id && s.status === "ACTIVE").length
    : 0

  const dialogs = (
    <>
      {state && (state.kind === "create" || state.kind === "edit") && (
        <GroupFormSheet
          key={state.key}
          open={state.open}
          onOpenChange={close}
          group={group}
          lookups={lookups}
          students={students}
          onSave={(result) =>
            commit(
              result,
              group ? `تم حفظ تعديلات ${result.group.name}` : `تم إنشاء ${result.group.name}`,
              !group
            )
          }
        />
      )}
      {(state?.kind === "deactivate" || state?.kind === "archive") && group && (
        <ConfirmDialog
          open={state.open}
          onOpenChange={close}
          destructive={state.kind === "archive"}
          title={state.kind === "archive" ? `أرشفة ${group.name}؟` : `إيقاف ${group.name} مؤقتًا؟`}
          description={
            memberCount > 0
              ? `تضم المجموعة ${countLabels.students(memberCount)} نشطين. يُنصح بنقلهم إلى مجموعات أخرى قبل ${
                  state.kind === "archive" ? "الأرشفة" : "الإيقاف"
                }.`
              : "لا تضم المجموعة طلبة نشطين."
          }
          confirmLabel={state.kind === "archive" ? "أرشفة" : "إيقاف مؤقت"}
          onConfirm={() =>
            commit(
              {
                group: { ...group, status: state.kind === "archive" ? "ARCHIVED" : "INACTIVE" },
                ...unchanged(group),
              },
              state.kind === "archive" ? `تمت أرشفة ${group.name}` : `تم إيقاف ${group.name} مؤقتًا`
            )
          }
        />
      )}
    </>
  )

  return { run, dialogs }
}

export function groupActions(
  group: Group,
  run: (kind: GroupAction, group: Group) => void,
  { includeView = true, includeEdit = true }: { includeView?: boolean; includeEdit?: boolean } = {}
): RowAction[] {
  const actions: RowAction[] = []
  if (includeView) actions.push({ label: "عرض المجموعة", icon: Eye, href: `/admin/groups/${group.id}` })
  if (includeEdit) actions.push({ label: "تعديل", icon: Pencil, onSelect: () => run("edit", group) })
  actions.push(
    group.status === "ACTIVE"
      ? { label: "إيقاف مؤقت", icon: PauseCircle, separated: true, onSelect: () => run("deactivate", group) }
      : { label: "إعادة التفعيل", icon: PlayCircle, separated: true, onSelect: () => run("activate", group) }
  )
  if (group.status !== "ARCHIVED") {
    actions.push({ label: "أرشفة", icon: Archive, destructive: true, onSelect: () => run("archive", group) })
  }
  return actions
}
