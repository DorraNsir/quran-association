"use client"

import { DoorOpen, Loader2, ShieldCheck } from "lucide-react"
import { useState } from "react"

import { StatusBadge } from "@/components/shared/badges"
import { FormErrorAlert } from "@/components/shared/form-error-alert"
import { QueryState } from "@/components/shared/query-state"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage } from "@/lib/api/errors"
import { money } from "@/lib/api/finance"
import { useClassMovePreview, type ClassMovePreviewDto } from "@/lib/api/hooks/groups"
import { describeClass, fullName, indexLookups, type Lookups, roomsLabel } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { formatMoney } from "@/lib/payments"
import type { Group, GroupClass, ID, Student } from "@/types/domain"

/**
 * «نقل القسم إلى مجموعة أخرى»: corrects the group of a class created in the
 * wrong one. Only a class that never had a student nor any recorded activity
 * moves, as it is (same branch, teachers, weekly slots and planned sessions);
 * the API decides and re-checks at confirmation. A class with students is
 * recreated in the right group instead, its students moved through «تغيير
 * المجموعة».
 */
export function MoveClassDialog({
  open,
  onOpenChange,
  group,
  groupClass,
  lookups,
  students,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  groupClass: GroupClass
  lookups: Lookups
  students: Student[]
  /** Moves through the API; a refusal is shown in the dialog */
  onConfirm: (groupId: ID) => Promise<void>
}) {
  const [targetId, setTargetId] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = useClassMovePreview(groupClass.id, targetId)
  const plan = targetId ? preview.data : undefined

  const current = describeClass(groupClass, indexLookups(lookups))
  const members = students.filter((s) => s.groupClassId === groupClass.id).length
  const destinations = lookups.groups.filter((g) => g.id !== group.id && g.status !== "ARCHIVED")

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await onConfirm(targetId)
    } catch (e) {
      setError(errorMessage(e))
      // The class may have changed since the preview: show why now
      void preview.refetch()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>نقل القسم إلى مجموعة أخرى</DialogTitle>
          <DialogDescription>
            يُنقل القسم كما هو، بفرعه ومعلميه ومواعيده وحصصه المبرمجة. يُسمح بذلك فقط لقسم لم يضمّ أي طالب ولم يُسجَّل فيه أي نشاط.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="text-xs text-muted-foreground">المجموعة الحالية</p>
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {group.name}
              {group.status !== "ACTIVE" && <StatusBadge status={group.status} />}
            </p>
            <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <DoorOpen className="size-3.5" aria-hidden />
                {current.branch?.name} · {roomsLabel(current.rooms)}
              </span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="size-3.5" aria-hidden />
                {current.supervisor ? fullName(current.supervisor) : "—"}
              </span>
            </p>
          </div>

          {members > 0 ? (
            <FormErrorAlert
              title="لا يمكن نقل قسم يضم طلبة"
              message={`يضم هذا القسم ${countLabels.students(members)}. أنشئ القسم في المجموعة الصحيحة، ثم انقل الطلبة إليه عبر «تغيير المجموعة» من صفحة كل طالب.`}
            />
          ) : destinations.length === 0 ? (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">لا توجد مجموعة أخرى غير مؤرشفة لنقل القسم إليها.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="move-class-target">المجموعة الجديدة</Label>
                <Select
                  value={targetId}
                  onValueChange={(id) => {
                    setTargetId(id)
                    setError(null)
                  }}
                >
                  <SelectTrigger id="move-class-target" className="w-full">
                    <SelectValue placeholder="اختر المجموعة" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-w-(--radix-select-trigger-width)">
                    {destinations.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                        {g.status !== "ACTIVE" && <span className="text-xs text-muted-foreground">— {labels.status[g.status]}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {targetId && <QueryState query={preview}>{plan && <MovePreview plan={plan} />}</QueryState>}
            </>
          )}
        </div>

        <FormErrorAlert message={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {labels.common.cancel}
          </Button>
          <Button disabled={pending || members > 0 || !plan?.eligible} onClick={() => void confirm()}>
            {pending && <Loader2 className="animate-spin" />}
            نقل القسم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Why it cannot move, or what it keeps and the destination's fee */
function MovePreview({ plan }: { plan: ClassMovePreviewDto }) {
  if (!plan.eligible)
    return (
      <FormErrorAlert
        title="لا يمكن نقل هذا القسم"
        message={
          <ul className="list-disc space-y-1 ps-4">
            {plan.blocks.map((b) => (
              <li key={b.code}>{b.message}</li>
            ))}
          </ul>
        }
      />
    )
  const { keeps } = plan
  return (
    <section aria-label="ما يبقى مع القسم" className="space-y-1.5 rounded-lg border bg-brand-soft/30 p-3 text-sm">
      <p className="font-medium">يبقى مع القسم</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
        <dt>المواعيد الأسبوعية:</dt>
        <dd className="font-medium">{keeps.weeklySchedules}</dd>
        <dt>الحصص المبرمجة:</dt>
        <dd className="font-medium">{keeps.plannedSessions}</dd>
        <dt>المعلمون:</dt>
        <dd className="font-medium">{keeps.teachers}</dd>
        {keeps.onboardingLinks > 0 && (
          <>
            <dt>روابط استكمال البيانات:</dt>
            <dd className="font-medium">{keeps.onboardingLinks}</dd>
          </>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">
        {plan.destinationFee === null
          ? `لم يُحدَّد بعد معلوم مجموعة «${plan.to.name}» للسنة الدراسية الحالية.`
          : `معلوم مجموعة «${plan.to.name}» للسنة الدراسية الحالية: ${formatMoney(money(plan.destinationFee))}، ويُطبَّق على من يلتحق بالقسم بعد النقل.`}
      </p>
    </section>
  )
}
