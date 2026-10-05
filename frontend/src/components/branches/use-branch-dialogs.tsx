"use client"

import { DoorOpen, Eye, PauseCircle, Pencil, PlayCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import type { RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { branchStats, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { Branch } from "@/types/domain"

import { BranchFormSheet } from "./branch-form-sheet"

export type BranchAction = "create" | "edit" | "deactivate" | "activate"

type DialogState = { kind: "create" | "edit" | "deactivate"; branch?: Branch; key: number; open: boolean }

const mockSaved = { description: labels.common.mockNotice }

export function useBranchDialogs({
  lookups,
  onChange,
}: {
  lookups: Lookups
  onChange?: (branch: Branch, isNew: boolean) => void
}) {
  const [state, setState] = useState<DialogState | null>(null)

  const close = (open: boolean) => {
    if (!open) setState((s) => (s ? { ...s, open: false } : s))
  }

  function commit(branch: Branch, message: string, isNew = false) {
    onChange?.(branch, isNew)
    toast.success(message, mockSaved)
    close(false)
  }

  function run(kind: BranchAction, branch?: Branch) {
    if (kind === "activate") {
      if (branch) commit({ ...branch, status: "ACTIVE" }, `تم تفعيل ${branch.name}`)
      return
    }
    setState({ kind, branch, key: Date.now(), open: true })
  }

  const branch = state?.branch
  const stats = branch ? branchStats(branch.id, lookups) : null

  const dialogs = (
    <>
      {state && (state.kind === "create" || state.kind === "edit") && (
        <BranchFormSheet
          key={state.key}
          open={state.open}
          onOpenChange={close}
          branch={branch}
          otherNames={lookups.branches.filter((b) => b.id !== branch?.id).map((b) => b.name.trim())}
          onSave={(saved) =>
            commit(saved, branch ? `تم حفظ تعديلات ${saved.name}` : `تمت إضافة ${saved.name}`, !branch)
          }
        />
      )}
      {state?.kind === "deactivate" && branch && stats && (
        <ConfirmDialog
          open={state.open}
          onOpenChange={close}
          destructive
          title={`إيقاف ${branch.name}؟`}
          description={
            stats.weeklySessions > 0
              ? `يحتضن هذا الفرع ${countLabels.sessions(stats.weeklySessions)} أسبوعيًا لـ${countLabels.groups(stats.activeGroups)}. يجب نقل هذه الحصص إلى فرع آخر بعد الإيقاف.`
              : "لا توجد حصص مبرمجة في هذا الفرع حاليًا."
          }
          confirmLabel="إيقاف الفرع"
          onConfirm={() => commit({ ...branch, status: "INACTIVE" }, `تم إيقاف ${branch.name}`)}
        />
      )}
    </>
  )

  return { run, dialogs }
}

export function branchActions(
  branch: Branch,
  run: (kind: BranchAction, branch: Branch) => void,
  { includeView = true, includeEdit = true }: { includeView?: boolean; includeEdit?: boolean } = {}
): RowAction[] {
  const actions: RowAction[] = []
  if (includeView) actions.push({ label: "عرض الفرع", icon: Eye, href: `/admin/branches/${branch.id}` })
  if (includeEdit) actions.push({ label: "تعديل", icon: Pencil, onSelect: () => run("edit", branch) })
  if (includeView) {
    actions.push({ label: "إدارة القاعات", icon: DoorOpen, href: `/admin/branches/${branch.id}#rooms` })
  }
  actions.push(
    branch.status === "ACTIVE"
      ? { label: "إيقاف الفرع", icon: PauseCircle, destructive: true, separated: true, onSelect: () => run("deactivate", branch) }
      : { label: "إعادة التفعيل", icon: PlayCircle, separated: true, onSelect: () => run("activate", branch) }
  )
  return actions
}
