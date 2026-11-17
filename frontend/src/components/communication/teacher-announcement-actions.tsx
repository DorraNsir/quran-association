"use client"

import { Archive, Pencil, Send, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { ActionsMenu, type RowAction } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import {
  useCreateTeacherAnnouncement,
  useTeacherAnnouncementAction,
  useUpdateTeacherAnnouncement,
  type AnnouncementDto,
  type TeacherAnnouncementAction,
} from "@/lib/api/announcements"
import { errorMessage } from "@/lib/api/errors"

import { CONFIRM } from "./announcements-views"
import type { ClassOption } from "./teacher-announcement-audience"
import { TeacherAnnouncementFormSheet } from "./teacher-announcement-form"

/**
 * The actions the API allows a teacher on an announcement: only their own
 * (canManage), and only those its status allows — edit (not archived),
 * publish a draft, archive a published one, delete. No scheduling, no restore.
 */
export function teacherActionsFor(
  a: AnnouncementDto,
  open: { edit: () => void; confirm: (kind: TeacherAnnouncementAction) => void }
): RowAction[] {
  if (!a.canManage) return []
  const actions: RowAction[] = []
  if (a.status !== "ARCHIVED") actions.push({ label: "تعديل", icon: Pencil, onSelect: open.edit })
  if (a.status === "DRAFT") actions.push({ label: "نشر الآن", icon: Send, onSelect: () => open.confirm("publish") })
  if (a.status === "PUBLISHED") actions.push({ label: "أرشفة", icon: Archive, onSelect: () => open.confirm("archive") })
  actions.push({ label: "حذف", icon: Trash2, destructive: true, separated: true, onSelect: () => open.confirm("delete") })
  return actions
}

/** The actions menu of one of MY announcements, with its confirmation and its edit form. */
export function TeacherAnnouncementActions({
  announcement,
  classes,
  triggerVariant,
  afterDelete,
}: {
  announcement: AnnouncementDto
  classes: ClassOption[]
  triggerVariant?: "outline"
  afterDelete?: () => void
}) {
  const [editing, setEditing] = useState<{ key: number; open: boolean }>({ key: 0, open: false })
  const [pending, setPending] = useState<TeacherAnnouncementAction | null>(null)
  const action = useTeacherAnnouncementAction(announcement.id)
  // Synchronous guard: a double confirm must not send the action twice
  const running = useRef(false)
  const actions = teacherActionsFor(announcement, {
    edit: () => setEditing((p) => ({ key: p.key + 1, open: true })),
    confirm: setPending,
  })
  if (actions.length === 0) return null
  const config = pending ? CONFIRM[pending] : null
  return (
    <>
      <ActionsMenu label={`إجراءات: ${announcement.title}`} triggerVariant={triggerVariant} actions={actions} />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={config?.title ?? ""}
        description={config ? config.description(announcement) : ""}
        confirmLabel={config?.label ?? ""}
        destructive={config?.destructive}
        onConfirm={async () => {
          if (!pending || !config || running.current) return
          running.current = true
          try {
            // Resolves only once the server confirmed; a refusal (403 / 404 / 409) keeps the dialog open with its message
            await action.mutateAsync(pending)
          } finally {
            running.current = false
          }
          toast.success(config.success)
          const done = pending
          setPending(null)
          if (done === "delete") afterDelete?.()
        }}
      />
      <TeacherAnnouncementEditor
        key={`edit-${editing.key}`}
        open={editing.open}
        onOpenChange={(open) => setEditing((p) => ({ ...p, open }))}
        announcement={announcement}
        classes={classes}
      />
    </>
  )
}

/** Create (publish now / draft) or edit MY announcement through the TEACHER endpoints only. */
export function TeacherAnnouncementEditor({
  open,
  onOpenChange,
  announcement,
  classes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement?: AnnouncementDto
  classes: ClassOption[]
}) {
  const create = useCreateTeacherAnnouncement()
  const update = useUpdateTeacherAnnouncement(announcement?.id ?? "")
  const mutation = announcement ? update : create
  // Synchronous guard: two fast clicks happen before `isPending` re-renders
  const submitting = useRef(false)
  return (
    <TeacherAnnouncementFormSheet
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      announcement={announcement}
      classes={classes}
      pending={mutation.isPending}
      error={mutation.isError ? errorMessage(mutation.error) : null}
      onSave={({ input, mode }) => {
        // One request at a time: a double submit never creates (or publishes) twice
        if (submitting.current || mutation.isPending) return
        submitting.current = true
        const release = () => {
          submitting.current = false
        }
        if (announcement) {
          update.mutate(
            { input, published: announcement.status === "PUBLISHED" },
            {
              onSettled: release,
              onSuccess: () => {
                onOpenChange(false)
                toast.success("تم تعديل الإعلان")
              },
            }
          )
          return
        }
        create.mutate(
          { input, mode },
          {
            onSettled: release,
            onSuccess: ({ notifiedCount }) => {
              onOpenChange(false)
              if (mode === "PUBLISH_NOW") toast.success("تم نشر الإعلان", { description: `أُرسل إشعار إلى ${notifiedCount} حساب.` })
              else toast.success("حُفظ الإعلان كمسودة", { description: "لم يُرسل أي إشعار." })
            },
          }
        )
      }}
    />
  )
}
