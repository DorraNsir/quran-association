"use client"

import { Banknote, CheckCircle2, CircleDashed, Plus, ReceiptText } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import {
  feePeriods,
  formatMoney,
  PAYMENT_STATUS_LABEL,
  paymentAmountError,
  periodLabel,
  type ObligationSummary,
  type PaymentStatus,
} from "@/lib/payments"
import { errorMessage } from "@/lib/api/errors"
import { useRecordPayment as useRecordPaymentMutation, useSetReceipt } from "@/lib/api/finance"
import { todayInTunis } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { GroupFee, Payment } from "@/types/domain"

/** Informational only — never a student or access status. */
export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const tone = { PAID: "bg-brand-soft text-brand-soft-foreground", PARTIAL: "bg-muted text-foreground", UNPAID: "bg-muted text-muted-foreground" }[status]
  return <Badge className={cn("font-normal", tone, className)}>{PAYMENT_STATUS_LABEL[status]}</Badge>
}

/** Receipt state of ONE payment, independent of the money. */
export function ReceiptBadge({ issued }: { issued: boolean }) {
  return issued ? (
    <span className="inline-flex items-center gap-1 text-xs text-primary">
      <CheckCircle2 className="size-3.5" aria-hidden />
      تم تسليم الوصل
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-warning">
      <CircleDashed className="size-3.5" aria-hidden />
      لم يتم تسليم الوصل
    </span>
  )
}

/** Expected / paid / remaining for one obligation. */
export function ObligationFigures({ summary, className }: { summary: ObligationSummary; className?: string }) {
  const items = [
    ["المبلغ المطلوب", summary.expected],
    ["المدفوع", summary.paid],
    ["المتبقي", summary.remaining],
  ] as const
  return (
    <dl className={cn("grid grid-cols-3 gap-2", className)}>
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border bg-card p-2.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Every transaction, with its own receipt state (admins can mark it delivered later). */
export function PaymentHistory({ payments, canEdit }: { payments: Payment[]; canEdit: boolean }) {
  const setReceipt = useSetReceipt()
  if (payments.length === 0) return <p className="py-2 text-sm text-muted-foreground">لا توجد دفعات مسجّلة.</p>
  return (
    <ol className="divide-y">
      {payments.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="font-medium tabular-nums">
              {formatMoney(p.amount)}
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                {formatDate(p.paidAt)} · {labels.paymentMethod[p.method]}
                {p.periodNumber && <> · {periodLabel(p.periodNumber)}</>}
              </span>
            </p>
            {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
          </div>
          <div className="flex items-center gap-2">
            <ReceiptBadge issued={p.receiptIssued} />
            {canEdit && !p.receiptIssued && (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={setReceipt.isPending}
                onClick={() =>
                  setReceipt.mutate(
                    { paymentId: p.id, receiptIssued: true },
                    {
                      onSuccess: () => toast.success("تم تسجيل تسليم الوصل", { description: "المبالغ لم تتغيّر." }),
                      onError: (error) => toast.error(errorMessage(error)),
                    }
                  )
                }
              >
                <ReceiptText />
                تسليم الوصل
              </Button>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** "تسجيل دفعة": cash only; never above what remains; receipt state recorded per payment. */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  summary,
  fee,
  studentName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: ObligationSummary
  fee?: GroupFee
  studentName: string
}) {
  const today = todayInTunis()
  const record = useRecordPaymentMutation()
  const periods = fee ? feePeriods(fee) : 1
  const paidPeriods = new Set(summary.payments.map((p) => p.periodNumber).filter(Boolean))
  const firstOpenPeriod = Array.from({ length: periods }, (_, i) => i + 1).find((n) => !paidPeriods.has(n)) ?? 1
  const [amount, setAmount] = useState(() => String(fee?.billingType === "MONTHLY" ? Math.min(fee.amount, summary.remaining) : summary.remaining))
  const [paidAt, setPaidAt] = useState(today)
  const [period, setPeriod] = useState(String(firstOpenPeriod))
  const [receipt, setReceipt] = useState<"yes" | "no">("yes")
  const [note, setNote] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const errors = {
    amount: paymentAmountError(Number(amount), summary.remaining),
    paidAt: !paidAt ? "تاريخ الدفع مطلوب" : paidAt > today ? "لا يمكن أن يكون التاريخ في المستقبل" : undefined,
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !record.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(true)
            if (errors.amount || errors.paidAt || record.isPending) return
            record.mutate(
              {
                obligationId: summary.obligation.id,
                amount: Number(amount),
                paidAt,
                receiptIssued: receipt === "yes",
                periodNumber: periods > 1 ? Number(period) : undefined,
                note,
              },
              {
                onSuccess: () => {
                  onOpenChange(false)
                  toast.success(`تم تسجيل دفعة ${formatMoney(Number(amount))}`, { description: studentName })
                },
              }
            )
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="size-5 text-primary" aria-hidden />
              تسجيل دفعة
            </DialogTitle>
            <DialogDescription>
              {studentName} · المتبقي: <span className="font-medium tabular-nums">{formatMoney(summary.remaining)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">المبلغ (د.ت)</Label>
              <Input id="pay-amount" type="number" inputMode="decimal" min={0} step="0.5" dir="ltr" value={amount}
                onChange={(e) => setAmount(e.target.value)} aria-invalid={(submitted && !!errors.amount) || undefined} />
              {submitted && errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">تاريخ الدفع</Label>
              <Input id="pay-date" type="date" max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              {submitted && errors.paidAt && <p className="text-xs text-destructive">{errors.paidAt}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">طريقة الدفع</Label>
              <Select value="CASH" disabled>
                <SelectTrigger id="pay-method" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="CASH">{labels.paymentMethod.CASH}</SelectItem></SelectContent>
              </Select>
            </div>
            {periods > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-period">الفترة</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger id="pay-period" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent position="popper">
                    {Array.from({ length: periods }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {periodLabel(n)}{paidPeriods.has(n) ? " (سُجّلت دفعة)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">هل تم تسليم الوصل؟</p>
            <ChoiceGroup label="هل تم تسليم الوصل؟" value={receipt} onChange={setReceipt}
              className="grid-cols-2"
              choices={[{ value: "yes", label: "نعم، تم التسليم" }, { value: "no", label: "لا، لاحقًا" }]} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-note">ملاحظة <span className="text-xs font-normal text-muted-foreground">(اختياري)</span></Label>
            <Textarea id="pay-note" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {record.isError && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage(record.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={record.isPending} onClick={() => onOpenChange(false)}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" className="min-w-24" disabled={record.isPending}>
              <Plus />
              تسجيل الدفعة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Opens RecordPaymentDialog with a fresh form each time. */
export function useRecordPayment() {
  const [target, setTarget] = useState<{ summary: ObligationSummary; fee?: GroupFee; studentName: string; key: number; open: boolean } | null>(null)
  return {
    open: (summary: ObligationSummary, fee: GroupFee | undefined, studentName: string) =>
      setTarget((p) => ({ summary, fee, studentName, key: (p?.key ?? 0) + 1, open: true })),
    render: () =>
      target ? (
        <RecordPaymentDialog
          key={target.key}
          open={target.open}
          onOpenChange={(open) => setTarget((p) => (p ? { ...p, open } : p))}
          summary={target.summary}
          fee={target.fee}
          studentName={target.studentName}
        />
      ) : null,
  }
}
