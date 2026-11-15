"use client"

import { CalendarX2 } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { FormErrorAlert } from "@/components/shared/form-error-alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api/errors"
import { useCancelSession } from "@/lib/api/sessions"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { StaffWorkspace } from "@/lib/workspace"

import type { SessionRow } from "./use-session-rows"

/**
 * «إلغاء الحصة» with an optional reason — the admin endpoint, or the
 * supervisor teacher's own (the API checks the supervisor, a lesson not
 * started yet and without attendance, and explains a refusal). The session
 * is kept as history (status CANCELLED); only this date is cancelled.
 */
export function CancelSessionDialog({
  row,
  workspace,
  open,
  onOpenChange,
}: {
  row: SessionRow
  workspace: StaffWorkspace
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { session, group } = row
  const cancel = useCancelSession(workspace, session.id)
  const [reason, setReason] = useState("")
  const reasonId = useId()
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (cancel.isPending) return
        if (!next) cancel.reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>إلغاء حصة {formatDate(session.date)}؟</DialogTitle>
          <DialogDescription>
            يُلغى هذا التاريخ فقط لقسم {row.branch?.name} من {group?.name}. البرنامج الأسبوعي وبقية الحصص والأقسام الأخرى لا تتغيّر.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={reasonId}>سبب الإلغاء (اختياري)</Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: عطلة، غياب المعلم، نشاط بالجمعية…"
            maxLength={160}
          />
        </div>
        {cancel.isError && <FormErrorAlert message={errorMessage(cancel.error)} />}
        <DialogFooter>
          <Button variant="outline" disabled={cancel.isPending} onClick={() => onOpenChange(false)}>
            {labels.common.cancel}
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(
                { cancellationReason: reason.trim() || undefined },
                {
                  onSuccess: () => {
                    onOpenChange(false)
                    toast.success(`أُلغيت حصة ${formatDate(session.date)}`)
                  },
                }
              )
            }
          >
            <CalendarX2 />
            إلغاء الحصة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
