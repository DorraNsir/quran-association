"use client"

import { DoorOpen, ShieldCheck, Wallet } from "lucide-react"
import { Loader2 } from "lucide-react"
import { useState } from "react"

import { FormErrorAlert } from "@/components/shared/form-error-alert"
import { QueryState } from "@/components/shared/query-state"
import { errorMessage } from "@/lib/api/errors"
import {
  money,
  transferConfirmation,
  useTransferPreview,
  type FinancialTransferConfirm,
  type TransferPlanDto,
} from "@/lib/api/finance"
import { formatMoney } from "@/lib/payments"

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
  /**
   * Transfers through the API with the confirmed «نقل مالي» of the preview
   * (exactly what was shown); a rejection is shown in the dialog
   */
  onConfirm: (groupClassId: ID, financialTransfers: FinancialTransferConfirm[]) => Promise<void>
}) {
  const [targetId, setTargetId] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const preview = useTransferPreview(student.id, targetId)
  const plan = targetId ? preview.data : undefined
  const blocked = plan?.transfers.some((t) => t.blocked) ?? false
  // A move with money involved is confirmed explicitly
  const needsConsent = Boolean(plan?.transfers.length) && !blocked

  async function confirm() {
    if (!plan) return
    setPending(true)
    setError(null)
    try {
      await onConfirm(targetId, transferConfirmation(plan))
    } catch (e) {
      setError(errorMessage(e))
      // The financial data may have changed: show the current preview again
      setAccepted(false)
      void preview.refetch()
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
              onChange={(id) => {
                setTargetId(id)
                setAccepted(false)
                setError(null)
              }}
              lookups={lookups}
              students={students}
              excludeClassId={student.groupClassId}
            />
          </div>

          {targetId && (
            <QueryState query={preview}>
              {plan && <FinancialTransferSummary plan={plan} />}
            </QueryState>
          )}
          {needsConsent && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              أؤكّد التسوية المالية أعلاه (يُغلق التزام المجموعة السابقة ويُحوَّل رصيده، دون المساس بالدفعات والوصولات).
            </label>
          )}
        </div>

        <FormErrorAlert message={error} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {labels.common.cancel}
          </Button>
          <Button
            disabled={pending || !targetId || targetId === student.groupClassId || !plan || blocked || (needsConsent && !accepted)}
            onClick={() => void confirm()}
          >
            {pending && <Loader2 className="animate-spin" />}
            تأكيد النقل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * «نقل مالي» preview: what was paid in the previous group, the credit that
 * follows the student, the new group's fee and what remains after the move.
 */
function FinancialTransferSummary({ plan }: { plan: TransferPlanDto }) {
  if (plan.sameGroup || plan.transfers.length === 0)
    return (
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        {plan.sameGroup ? "قسم من نفس المجموعة: لا تتغيّر مستحقات الطالب." : "لا توجد مستحقات مالية للطالب تتأثّر بهذا النقل."}
      </p>
    )
  return (
    <div className="space-y-3">
      {plan.transfers.map((t) =>
        t.blocked ? (
          <FormErrorAlert
            key={t.from.obligationId}
            title="لا يمكن النقل المالي"
            message={`لا يوجد معلوم ساري لمجموعة «${t.to.group.name}» في السنة الدراسية ${t.academicYear.label}. حدّد معلومها أولًا من صفحة المجموعة، ثم انقل الطالب ليُحوَّل رصيده (${formatMoney(money(t.from.settledAmount))}) من مجموعة «${t.from.group.name}».`}
          />
        ) : (
          <section
            key={t.from.obligationId}
            aria-label="التسوية المالية"
            className="space-y-1.5 rounded-lg border bg-brand-soft/30 p-3 text-sm"
          >
            <p className="flex items-center gap-1.5 font-medium">
              <Wallet className="size-4 text-primary" aria-hidden />
              التسوية المالية <span className="text-xs font-normal text-muted-foreground" dir="ltr">({t.academicYear.label})</span>
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
              <dt>المبلغ المدفوع سابقًا:</dt>
              <dd className="font-medium">{formatMoney(money(t.from.settledAmount))}</dd>
              <dt>الرصيد الذي سيُحوّل:</dt>
              <dd className="font-medium">{formatMoney(money(t.creditAmount))}</dd>
              <dt>المعلوم في المجموعة الجديدة:</dt>
              <dd className="font-medium">{formatMoney(money(t.to.requiredAmount ?? "0"))}</dd>
              <dt>المبلغ المتبقي بعد التحويل:</dt>
              <dd className="font-semibold">{formatMoney(money(t.remainingAfter ?? "0"))}</dd>
              {Number(t.excessAmount) > 0 && (
                <>
                  <dt>رصيد زائد يبقى في المجموعة السابقة:</dt>
                  <dd className="font-medium">{formatMoney(money(t.excessAmount))}</dd>
                </>
              )}
            </dl>
            <p className="text-xs text-muted-foreground">
              يُغلق التزام مجموعة «{t.from.group.name}» ({formatMoney(money(t.from.requiredAmount))}) دون أي دين متبقٍّ؛ تبقى الدفعات والوصولات مسجّلة كما هي.
            </p>
          </section>
        )
      )}
    </div>
  )
}
