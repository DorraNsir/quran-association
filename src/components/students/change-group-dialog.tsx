"use client"

import { ArrowLeft, MapPin, ShieldCheck } from "lucide-react"
import { useState } from "react"

import { GroupSelect } from "@/components/groups/group-select"
import { ScheduleSummary } from "@/components/shared/schedule"
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
import { fullName, groupLocation, indexLookups, type Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import type { ID, Student } from "@/types/domain"

export function ChangeGroupDialog({
  open,
  onOpenChange,
  student,
  lookups,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: Student
  lookups: Lookups
  onConfirm: (groupId: ID) => void
}) {
  const [targetId, setTargetId] = useState("")
  const { branchesById, groupsById, teachersById } = indexLookups(lookups)
  const current = groupsById.get(student.groupId)
  const target = groupsById.get(targetId)
  const supervisor = target && teachersById.get(target.supervisorId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تغيير مجموعة الطالب</DialogTitle>
          <DialogDescription>
            ينتمي {fullName(student)} إلى مجموعة واحدة نشطة. سيُنقل من مجموعته الحالية إلى المجموعة الجديدة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="text-xs text-muted-foreground">المجموعة الحالية</p>
            <p className="font-medium">{current?.name ?? "—"}</p>
            {current && (
              <p className="text-xs text-muted-foreground">{groupLocation(current, branchesById)}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change-group-target">المجموعة الجديدة</Label>
            <GroupSelect
              id="change-group-target"
              value={targetId}
              onValueChange={setTargetId}
              groups={lookups.groups}
              branches={lookups.branches}
              excludeId={student.groupId}
            />
          </div>

          {target && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-brand-soft/40 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <ArrowLeft className="size-4 text-primary ltr:rotate-180" aria-hidden />
                {target.name}
                <span className="text-xs font-normal text-muted-foreground">{target.audience}</span>
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden />
                {groupLocation(target, branchesById)}
              </p>
              {supervisor && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {labels.teachingRole.SUPERVISOR}: {fullName(supervisor)}
                </p>
              )}
              <ScheduleSummary schedule={target.schedule} className="pt-1" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {labels.common.cancel}
          </Button>
          <Button disabled={!target} onClick={() => target && onConfirm(target.id)}>
            تأكيد النقل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
