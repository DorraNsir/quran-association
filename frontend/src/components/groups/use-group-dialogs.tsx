"use client"

import { Archive, Eye, PauseCircle, Pencil, PlayCircle, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { classesOf, indexLookups, schedulesOf, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { errorMessage } from "@/lib/api/errors"
import { useSaveClass, useSaveGroup, useSetClassStatus, useSetGroupStatus } from "@/lib/api/hooks/groups"
import { checkClassSlots } from "@/lib/scheduling"
import type { Group, GroupClass, Student } from "@/types/domain"

import { ClassFormSheet } from "./class-form-sheet"
import { GroupFormSheet } from "./group-form-sheet"

export type GroupAction = "create" | "edit" | "deactivate" | "archive" | "activate" | "add-class"
export type ClassAction = "edit-class" | "deactivate-class" | "archive-class" | "activate-class"

type DialogContent =
  | { kind: "group-form"; group?: Group }
  | { kind: "group-status"; group: Group; to: "INACTIVE" | "ARCHIVED" }
  | { kind: "class-form"; group: Group; groupClass?: GroupClass }
  | { kind: "class-status"; group: Group; groupClass: GroupClass; to: "INACTIVE" | "ARCHIVED" }

type DialogState = DialogContent & { key: number; open: boolean }

/**
 * Dialogs for a pedagogical group and its classes. Group changes and class
 * changes are reported separately because they are separate records.
 */
export function useGroupDialogs({ lookups, students }: { lookups: Lookups; students: Student[] }) {
  const [state, setState] = useState<DialogState | null>(null)
  const saveGroup = useSaveGroup()
  const setGroupStatus = useSetGroupStatus()
  const saveClass = useSaveClass()
  const setClassStatus = useSetClassStatus()
  const { branchesById } = indexLookups(lookups)

  const close = (open: boolean) => {
    if (!open) setState((s) => (s ? { ...s, open: false } : s))
  }
  const openDialog = (next: DialogContent) =>
    setState((prev) => ({ ...next, key: (prev?.key ?? 0) + 1, open: true }))

  const activeIn = (classes: GroupClass[]) =>
    students.filter((s) => s.status === "ACTIVE" && classes.some((c) => c.id === s.groupClassId)).length

  /** A paused class's old slots may now collide with other classes. */
  function hasConflicts(groupClass: GroupClass, group: Group) {
    const drafts = schedulesOf(groupClass.id, lookups.schedules).map((s) => ({ ...s, key: s.id }))
    const data = { ...lookups, groups: lookups.groups.map((g) => (g.id === group.id ? group : g)) }
    return [...checkClassSlots(drafts, groupClass, data).values()].some((c) => c.conflicts.length > 0)
  }

  /** Toasts success only after the API confirmed; failures are toasted in Arabic. */
  async function attempt(action: () => Promise<unknown>, message: string) {
    try {
      await action()
      toast.success(message)
      close(false)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  function run(action: GroupAction, group?: Group) {
    if (action === "create") return openDialog({ kind: "group-form" })
    if (!group) return
    if (action === "edit") return openDialog({ kind: "group-form", group })
    if (action === "add-class") return openDialog({ kind: "class-form", group })
    if (action === "deactivate" || action === "archive") {
      return openDialog({ kind: "group-status", group, to: action === "archive" ? "ARCHIVED" : "INACTIVE" })
    }
    const activated: Group = { ...group, status: "ACTIVE" }
    const blocked = classesOf(group.id, lookups.groupClasses).find(
      (c) => c.status === "ACTIVE" && hasConflicts(c, activated)
    )
    if (blocked) {
      toast.error(`لا يمكن تفعيل ${group.name} بمواعيدها الحالية`, {
        description: `قسم ${branchesById.get(blocked.branchId)?.name ?? ""} يتعارض مع أقسام أخرى. عدّل مواعيده أولًا.`,
      })
      return openDialog({ kind: "class-form", group: activated, groupClass: blocked })
    }
    void attempt(() => setGroupStatus.mutateAsync({ id: group.id, status: "ACTIVE" }), `تم تفعيل ${group.name}`)
  }

  function runClass(action: ClassAction, group: Group, groupClass: GroupClass) {
    if (action === "edit-class") return openDialog({ kind: "class-form", group, groupClass })
    if (action === "deactivate-class" || action === "archive-class") {
      return openDialog({
        kind: "class-status",
        group,
        groupClass,
        to: action === "archive-class" ? "ARCHIVED" : "INACTIVE",
      })
    }
    const activated: GroupClass = { ...groupClass, status: "ACTIVE" }
    if (hasConflicts(activated, group)) {
      toast.error("لا يمكن تفعيل القسم بمواعيده الحالية", {
        description: "بعض حصصه تتعارض مع أقسام أخرى. عدّل المواعيد أولًا.",
      })
      return openDialog({ kind: "class-form", group, groupClass: activated })
    }
    void attempt(() => setClassStatus.mutateAsync({ id: groupClass.id, status: "ACTIVE" }), "تم تفعيل القسم")
  }

  function renderDialog(d: DialogState) {
    switch (d.kind) {
      case "group-form":
        return (
          <GroupFormSheet
            key={d.key}
            open={d.open}
            onOpenChange={close}
            group={d.group}
            otherNames={lookups.groups.filter((g) => g.id !== d.group?.id).map((g) => g.name.trim())}
            onSave={async (values) => {
              await saveGroup.mutateAsync({ id: d.group?.id, ...values })
              toast.success(d.group ? `تم حفظ تعديلات ${values.name}` : `تم إنشاء ${values.name} — أضف أقسامها من صفحتها`)
              close(false)
            }}
          />
        )
      case "class-form":
        return (
          <ClassFormSheet
            key={d.key}
            open={d.open}
            onOpenChange={close}
            group={d.group}
            groupClass={d.groupClass}
            lookups={lookups}
            students={students}
            onSave={async (input) => {
              try {
                await saveClass.mutateAsync(input)
              } catch (error) {
                // Some steps may have been applied: the screens reload the real state
                throw error
              }
              toast.success(
                `${d.groupClass ? "تم حفظ قسم" : "تم إنشاء قسم"} ${branchesById.get(input.groupClass.branchId)?.name ?? ""} — ${d.group.name}`
              )
              close(false)
            }}
          />
        )
      case "group-status": {
        const classes = classesOf(d.group.id, lookups.groupClasses)
        const active = activeIn(classes)
        return (
          <ConfirmDialog
            open={d.open}
            onOpenChange={close}
            destructive={d.to === "ARCHIVED"}
            title={d.to === "ARCHIVED" ? `أرشفة ${d.group.name}؟` : `إيقاف ${d.group.name} مؤقتًا؟`}
            description={`يشمل ذلك ${countLabels.classes(classes.length)}${
              active > 0 ? ` و${countLabels.students(active)} نشطين — يُنصح بنقلهم أولًا` : ""
            }.`}
            confirmLabel={d.to === "ARCHIVED" ? "أرشفة" : "إيقاف مؤقت"}
            onConfirm={async () => {
              await setGroupStatus.mutateAsync({ id: d.group.id, status: d.to })
              toast.success(d.to === "ARCHIVED" ? `تمت أرشفة ${d.group.name}` : `تم إيقاف ${d.group.name} مؤقتًا`)
              close(false)
            }}
          />
        )
      }
      case "class-status": {
        const active = activeIn([d.groupClass])
        return (
          <ConfirmDialog
            open={d.open}
            onOpenChange={close}
            destructive={d.to === "ARCHIVED"}
            title={`${d.to === "ARCHIVED" ? "أرشفة" : "إيقاف"} قسم ${branchesById.get(d.groupClass.branchId)?.name ?? ""}؟`}
            description={
              active > 0
                ? `يضم القسم ${countLabels.students(active)} نشطين. يُنصح بنقلهم إلى قسم آخر قبل ذلك. بقية أقسام ${d.group.name} لا تتأثر.`
                : `لا يضم القسم طلبة نشطين. بقية أقسام ${d.group.name} لا تتأثر.`
            }
            confirmLabel={d.to === "ARCHIVED" ? "أرشفة" : "إيقاف مؤقت"}
            onConfirm={async () => {
              await setClassStatus.mutateAsync({ id: d.groupClass.id, status: d.to })
              toast.success(d.to === "ARCHIVED" ? "تمت أرشفة القسم" : "تم إيقاف القسم مؤقتًا")
              close(false)
            }}
          />
        )
      }
    }
  }

  return { run, runClass, dialogs: state ? renderDialog(state) : null }
}

export function groupActions(
  group: Group,
  run: (action: GroupAction, group: Group) => void,
  {
    includeView = true,
    includeEdit = true,
    includeAddClass = true,
  }: { includeView?: boolean; includeEdit?: boolean; includeAddClass?: boolean } = {}
): RowAction[] {
  const actions: RowAction[] = []
  if (includeView) actions.push({ label: "عرض المجموعة", icon: Eye, href: `/admin/groups/${group.id}` })
  if (includeEdit) actions.push({ label: "تعديل المجموعة", icon: Pencil, onSelect: () => run("edit", group) })
  if (includeAddClass) actions.push({ label: "إضافة قسم", icon: Plus, onSelect: () => run("add-class", group) })
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

export function classActions(
  group: Group,
  groupClass: GroupClass,
  runClass: (action: ClassAction, group: Group, groupClass: GroupClass) => void
): RowAction[] {
  const actions: RowAction[] = [
    { label: "تعديل القسم", icon: Pencil, onSelect: () => runClass("edit-class", group, groupClass) },
    groupClass.status === "ACTIVE"
      ? { label: "إيقاف القسم", icon: PauseCircle, separated: true, onSelect: () => runClass("deactivate-class", group, groupClass) }
      : { label: "إعادة التفعيل", icon: PlayCircle, separated: true, onSelect: () => runClass("activate-class", group, groupClass) },
  ]
  if (groupClass.status !== "ARCHIVED") {
    actions.push({ label: "أرشفة القسم", icon: Archive, destructive: true, onSelect: () => runClass("archive-class", group, groupClass) })
  }
  return actions
}
