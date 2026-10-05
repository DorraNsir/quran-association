"use client"

import { DoorOpen, ShieldCheck } from "lucide-react"
import { useState } from "react"

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
import { fullName, indexLookups, studentClass, type Lookups } from "@/lib/domain"
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
  onConfirm: (groupClassId: ID) => void
}) {
  const [targetId, setTargetId] = useState("")
  const current = studentClass(student, indexLookups(lookups))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تغيير المجموعة أو الحلقة</DialogTitle>
          <DialogDescription>
            يدرس {fullName(student)} في حلقة واحدة. يمكن نقله إلى مجموعة أخرى، أو إلى حلقة أخرى من نفس المجموعة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {current && (
            <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="text-xs text-muted-foreground">الحلقة الحالية</p>
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
                  {current.room?.name}
                </span>
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="change-class-target">الحلقة الجديدة</Label>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {labels.common.cancel}
          </Button>
          <Button disabled={!targetId || targetId === student.groupClassId} onClick={() => onConfirm(targetId)}>
            تأكيد النقل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
