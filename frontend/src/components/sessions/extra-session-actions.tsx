"use client"

import { toast } from "sonner"

import { ExtraSessionSheet } from "@/components/calendar/scheduling-actions"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { WithLookups } from "@/components/shared/with-lookups"
import { useDeleteSession, type SessionDto } from "@/lib/api/sessions"
import { formatDate } from "@/lib/format"

/** Admin «تعديل الحصة» of an extra lesson: the extra-lesson form in edit mode (admin references). */
export function EditExtraSessionSheet({
  session,
  open,
  onOpenChange,
}: {
  session: SessionDto
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <WithLookups>
      {(lookups) => <ExtraSessionSheet open={open} onOpenChange={onOpenChange} lookups={lookups} session={session} />}
    </WithLookups>
  )
}

/**
 * Admin «حذف نهائي» of an extra lesson: removed from the database (not a
 * cancellation), irreversibly. Confirmation required; the API refuses a
 * lesson with attendance, planned work or saved history, and its Arabic
 * message is shown in the dialog.
 */
export function DeleteExtraSessionDialog({
  session,
  open,
  onOpenChange,
  onDeleted,
}: {
  session: { id: string; date: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const remove = useDeleteSession(session.id)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      title="حذف الحصة نهائيًا"
      description={
        <>
          هل أنت متأكد من حذف هذه الحصة الإضافية نهائيًا؟
          <br />
          سيتم حذف الحصة من قاعدة البيانات، ولا يمكن التراجع عن هذا الإجراء.
          <br />
          لا يمكن حذف الحصة إذا كانت مرتبطة بسجلات حضور أو أعمال أو بيانات تاريخية محفوظة.
        </>
      }
      confirmLabel="حذف نهائي"
      cancelLabel="تراجع"
      onConfirm={async () => {
        await remove.mutateAsync()
        onOpenChange(false)
        toast.success(`حُذفت الحصة الإضافية ليوم ${formatDate(session.date)} نهائيًا`)
        onDeleted?.()
      }}
    />
  )
}
