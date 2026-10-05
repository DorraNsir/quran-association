"use client"

import { Archive, Eye, PauseCircle, Pencil, PlayCircle, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { classesOf, indexLookups, schedulesOf, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { checkClassSlots } from "@/lib/scheduling"
import type { Group, GroupClass, Student } from "@/types/domain"

import { ClassFormSheet, type ClassSaveResult } from "./class-form-sheet"
import { GroupFormSheet } from "./group-form-sheet"

export type GroupAction = "create" | "edit" | "deactivate" | "archive" | "activate" | "add-class"
export type ClassAction = "edit-class" | "deactivate-class" | "archive-class" | "activate-class"

type DialogContent =
  | { kind: "group-form"; group?: Group }
  | { kind: "group-status"; group: Group; to: "INACTIVE" | "ARCHIVED" }
  | { kind: "class-form"; group: Group; groupClass?: GroupClass }
  | { kind: "class-status"; group: Group; groupClass: GroupClass; to: "INACTIVE" | "ARCHIVED" }

type DialogState = DialogContent & { key: number; open: boolean }

const mockSaved = { description: labels.common.mockNotice }

/**
 * Dialogs for a pedagogical group and its classes. Group changes and class
 * changes are reported separately because they are separate records.
 */
export function useGroupDialogs({
  lookups,
  students,
  onGroupChange,
  onClassChange,
}: {
  lookups: Lookups
  students: Student[]
  onGroupChange?: (group: Group, isNew: boolean) => void
  onClassChange?: (result: ClassSaveResult, isNew: boolean) => void
}) {
  const [state, setState] = useState<DialogState | null>(null)
  const { branchesById } = indexLookups(lookups)

  const close = (open: boolean) => {
    if (!open) setState((s) => (s ? { ...s, open: false } : s))
  }
  const openDialog = (next: DialogContent) =>
    setState((prev) => ({ ...next, key: (prev?.key ?? 0) + 1, open: true }))

  const unchanged = (groupClass: GroupClass): Omit<ClassSaveResult, "groupClass"> => ({
    studentIds: students.filter((s) => s.groupClassId === groupClass.id).map((s) => s.id),
    schedules: schedulesOf(groupClass.id, lookups.schedules),
  })
  const activeIn = (classes: GroupClass[]) =>
    students.filter((s) => s.status === "ACTIVE" && classes.some((c) => c.id === s.groupClassId)).length

  /** A paused class's old slots may now collide with other classes. */
  function hasConflicts(groupClass: GroupClass, group: Group) {
    const drafts = schedulesOf(groupClass.id, lookups.schedules).map((s) => ({ ...s, key: s.id }))
    const data = { ...lookups, groups: lookups.groups.map((g) => (g.id === group.id ? group : g)) }
    return [...checkClassSlots(drafts, groupClass, data).values()].some((c) => c.conflicts.length > 0)
  }

  function commitGroup(group: Group, message: string, isNew = false) {
    onGroupChange?.(group, isNew)
    toast.success(message, mockSaved)
    close(false)
  }
  function commitClass(result: ClassSaveResult, message: string, isNew = false) {
    onClassChange?.(result, isNew)
    toast.success(message, mockSaved)
    close(false)
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
        description: `حلقة ${branchesById.get(blocked.branchId)?.name ?? ""} تتعارض مع حلقات أخرى. عدّل مواعيدها أولًا.`,
      })
      return openDialog({ kind: "class-form", group: activated, groupClass: blocked })
    }
    commitGroup(activated, `تم تفعيل ${group.name}`)
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
      toast.error("لا يمكن تفعيل الحلقة بمواعيدها الحالية", {
        description: "بعض حصصها تتعارض مع حلقات أخرى. عدّل المواعيد أولًا.",
      })
      return openDialog({ kind: "class-form", group, groupClass: activated })
    }
    commitClass({ groupClass: activated, ...unchanged(groupClass) }, "تم تفعيل الحلقة")
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
            onSave={(saved) =>
              commitGroup(
                saved,
                d.group ? `تم حفظ تعديلات ${saved.name}` : `تم إنشاء ${saved.name} — أضف حلقاتها من صفحتها`,
                !d.group
              )
            }
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
            onSave={(result) =>
              commitClass(
                result,
                `${d.groupClass ? "تم حفظ حلقة" : "تم إنشاء حلقة"} ${branchesById.get(result.groupClass.branchId)?.name ?? ""} — ${d.group.name}`,
                !d.groupClass
              )
            }
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
            onConfirm={() =>
              commitGroup(
                { ...d.group, status: d.to },
                d.to === "ARCHIVED" ? `تمت أرشفة ${d.group.name}` : `تم إيقاف ${d.group.name} مؤقتًا`
              )
            }
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
            title={`${d.to === "ARCHIVED" ? "أرشفة" : "إيقاف"} حلقة ${branchesById.get(d.groupClass.branchId)?.name ?? ""}؟`}
            description={
              active > 0
                ? `تضم الحلقة ${countLabels.students(active)} نشطين. يُنصح بنقلهم إلى حلقة أخرى قبل ذلك. بقية حلقات ${d.group.name} لا تتأثر.`
                : `لا تضم الحلقة طلبة نشطين. بقية حلقات ${d.group.name} لا تتأثر.`
            }
            confirmLabel={d.to === "ARCHIVED" ? "أرشفة" : "إيقاف مؤقت"}
            onConfirm={() =>
              commitClass(
                { groupClass: { ...d.groupClass, status: d.to }, ...unchanged(d.groupClass) },
                d.to === "ARCHIVED" ? "تمت أرشفة الحلقة" : "تم إيقاف الحلقة مؤقتًا"
              )
            }
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
  if (includeAddClass) actions.push({ label: "إضافة حلقة", icon: Plus, onSelect: () => run("add-class", group) })
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
    { label: "تعديل الحلقة", icon: Pencil, onSelect: () => runClass("edit-class", group, groupClass) },
    groupClass.status === "ACTIVE"
      ? { label: "إيقاف الحلقة", icon: PauseCircle, separated: true, onSelect: () => runClass("deactivate-class", group, groupClass) }
      : { label: "إعادة التفعيل", icon: PlayCircle, separated: true, onSelect: () => runClass("activate-class", group, groupClass) },
  ]
  if (groupClass.status !== "ARCHIVED") {
    actions.push({ label: "أرشفة الحلقة", icon: Archive, destructive: true, onSelect: () => runClass("archive-class", group, groupClass) })
  }
  return actions
}
