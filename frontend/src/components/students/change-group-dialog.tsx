"use client"

import { DoorOpen, ShieldCheck } from "lucide-react"
import { AlertCircle, Loader2 } from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { errorMessage } from "@/lib/api/errors"

import { ClassPicker } from "@/components/groups/class-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { fullName, indexLookups, type Lookups, roomsLabel, studentClass } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import type { ID, Student } from "@/types/domain"

/** Moves a student to another class — of another group, or of the same group (other branch/supervisor). */
export function ChangeGroupDialog({
  open,
  onOpenChange,
  student,
  lookups,
  students,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: Student
  lookups: Lookups
  students?: Student[]
  /** Transfers through the API; a rejection is shown in the dialog */
  onConfirm: (groupClassId: ID) => Promise<void>
}) {
  const [targetId, setTargetId] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await onConfirm(targetId)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }
  const current = studentClass(student, indexLookups(lookups))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تغيير المجموعة أو القسم</DialogTitle>
          <DialogDescription>
            يدرس {fullName(student)} في قسم واحد. يمكن نقله إلى مجموعة أخرى، أو إلى قسم آخر من نفس المجموعة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {current && (
            <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="text-xs text-muted-foreground">القسم الحالي</p>
              <p className="font-medium">
                {current.group?.name} · {current.branch?.name}
              </p>
              <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {current.supervisor ? fullName(current.supervisor) : "—"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <DoorOpen className="size-3.5" aria-hidden />
                  {roomsLabel(current.rooms)}
                </span>
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="change-class-target">القسم الجديد</Label>
            <ClassPicker
              id="change-class-target"
              value={targetId}
              onChange={setTargetId}
              lookups={lookups}
              students={students}
              excludeClassId={student.groupClassId}
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {labels.common.cancel}
          </Button>
          <Button disabled={pending || !targetId || targetId === student.groupClassId} onClick={() => void confirm()}>
            {pending && <Loader2 className="animate-spin" />}
            تأكيد النقل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
