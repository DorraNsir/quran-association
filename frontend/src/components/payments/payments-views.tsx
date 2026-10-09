"use client"

import { Banknote, CircleDashed, History, Pencil, Plus, ReceiptText, SearchX, Users, Wallet } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters"
import { FormField } from "@/components/shared/form"
import { SectionCard } from "@/components/shared/info-list"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { PersonCell } from "@/components/shared/user-avatar"
import { AcademicYearSelect } from "@/components/memorization/period-selectors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import { defaultPeriod } from "@/lib/memorization"
import {
  feePeriods,
  feeTotal,
  formatMoney,
  PAYMENT_STATUS_LABEL,
  type PaymentStatus,
} from "@/lib/payments"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { errorMessage } from "@/lib/api/errors"
import {
  money,
  toObligationRow,
  toPayment,
  useApplicableFee,
  useCreateObligation,
  useDeactivateGroupFee,
  useFinanceSummary,
  useGroupFees,
  useObligationPayments,
  useObligations,
  useSetGroupFee,
  useStudentFinance,
  type ObligationRow,
} from "@/lib/api/finance"
import { todayInTunis } from "@/lib/dates"
import type { BillingType, Group, GroupFee, ID, ISODate } from "@/types/domain"

import { ObligationFigures, PaymentHistory, PaymentStatusBadge, ReceiptBadge, useRecordPayment } from "./payment-parts"
import { useAcademicYears, usePlatformSettings } from "@/lib/store/settings"

/** "120 د.ت · سنوي" or "20 د.ت × 2 أشهر = 40 د.ت". */
export function feeDescription(fee: GroupFee) {
  return fee.billingType === "MONTHLY"
    ? `${formatMoney(fee.amount)} شهريًا × ${feePeriods(fee)} = ${formatMoney(feeTotal(fee))}`
    : `${formatMoney(fee.amount)} · ${labels.billingType.YEARLY}`
}

/**
 * One student's obligations per academic year (expected / paid / remaining
 * + every payment with its receipt), as computed by the API. Admin can
 * create the current year's obligation from the class fee, record payments
 * and mark receipts delivered; the student only consults their own data.
 */
export function StudentPayments({ studentId, mode, groupClassId }: { studentId?: ID; mode: "admin" | "student"; groupClassId?: ID }) {
  const recorder = useRecordPayment()
  const { rows, queries } = useStudentFinance(mode, studentId)
  const applicable = useApplicableFee(mode === "admin" ? groupClassId : undefined)
  const createObligation = useCreateObligation()
  if (!rows) return <QueryState query={queries}>{null}</QueryState>
  const fee = applicable.data?.fee
  // The class's fee for the current year exists but no obligation was created for it yet
  const missing = mode === "admin" && studentId && fee && fee.isActive && !rows.some((r) => r.fee.id === fee.id)
  const createButton = missing ? (
    <Button
      size="sm"
      disabled={createObligation.isPending}
      onClick={() =>
        createObligation.mutate(
          { studentId, groupFeeId: fee.id },
          {
            onSuccess: () => toast.success("أُنشئ التزام الطالب", { description: `${fee.label} · ${formatMoney(Number(fee.totalAmount))}` }),
            onError: (error) => toast.error(errorMessage(error)),
          }
        )
      }
    >
      <Plus />
      إنشاء التزام «{fee.label}»
    </Button>
  ) : null

  if (rows.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={Wallet}
          title="لا يوجد معلوم مسجّل"
          description={missing ? "معلوم المجموعة محدَّد لهذه السنة: أنشئ التزام الطالب لتسجيل دفعاته." : "لم يُحدَّد بعد معلوم للمجموعة التي يدرس فيها الطالب."}
          action={createButton ?? undefined}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {createButton && <div className="flex justify-end">{createButton}</div>}
      {rows.map(({ summary, fee: rowFee, dto }) => (
        <SectionCard key={summary.obligation.id} title={rowFee.label} icon={Wallet} action={<PaymentStatusBadge status={summary.status} />}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span dir="ltr">{dto.academicYear.label}</span> · {feeDescription(rowFee)}
            </p>
            <ObligationFigures summary={summary} />
            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <History className="size-4 text-muted-foreground" aria-hidden />
                سجل الدفعات ({summary.payments.length})
              </p>
              {mode === "admin" && summary.remaining > 0 && (
                <Button size="sm" onClick={() => recorder.open(summary, rowFee, `${dto.student.firstName} ${dto.student.lastName}`)}>
                  <Plus />
                  تسجيل دفعة
                </Button>
              )}
            </div>
            <PaymentHistory payments={[...summary.payments].reverse()} canEdit={mode === "admin"} />
          </div>
        </SectionCard>
      ))}
      {mode === "admin" && recorder.render()}
    </div>
  )
}

/** Payments of one obligation, loaded when its history is opened. */
function ObligationHistory({ row }: { row: ObligationRow }) {
  const payments = useObligationPayments(row.summary.obligation.id)
  const live = (payments.data ?? []).filter((p) => !p.voided).map(toPayment)
  return (
    <QueryState query={payments}>
      <PaymentHistory payments={[...live].reverse()} canEdit />
    </QueryState>
  )
}

/** Association-wide, informational payment tracking (no deadlines, no blocking) — server filters and totals. */
export function PaymentsOverview({ lookups }: { lookups: Lookups }) {
  const today = todayInTunis()
  const academicYears = useAcademicYears()
  const pageSize = usePlatformSettings().defaultPageSize
  const recorder = useRecordPayment()
  // The years load asynchronously: until one is picked, the default (current) year applies
  const [pickedYearId, setAcademicYearId] = useState<string>()
  const academicYearId = pickedYearId ?? defaultPeriod(academicYears, today).academicYearId
  const [query, setQuery] = useState("")
  const [groupId, setGroupId] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const [history, setHistory] = useState<ObligationRow | null>(null)
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  const filters = {
    academicYearId: academicYearId || undefined,
    groupId: groupId === ALL ? undefined : groupId,
  }
  const list = useObligations(
    { ...filters, status: status === ALL ? undefined : (status as PaymentStatus), search: query.trim() || undefined },
    page,
    pageSize,
    Boolean(academicYearId)
  )
  const summary = useFinanceSummary(filters, Boolean(academicYearId))
  const rows = (list.data?.data ?? []).map((o) => toObligationRow(o))
  const totals = summary.data
  const hasFilters = Boolean(query) || [groupId, status].some((v) => v !== ALL)
  const studentName = (r: ObligationRow) => `${r.dto.student.firstName} ${r.dto.student.lastName}`

  const recordButton = (r: ObligationRow) =>
    r.summary.remaining > 0 ? (
      <Button size="sm" variant="outline" onClick={() => recorder.open(r.summary, r.fee, studentName(r))}>
        <Plus />
        تسجيل دفعة
      </Button>
    ) : null
  const receiptCell = (r: ObligationRow) =>
    r.summary.undeliveredReceipts > 0 ? (
      <span className="inline-flex items-center gap-1 text-xs text-warning whitespace-nowrap">
        <CircleDashed className="size-3.5" aria-hidden />
        {r.summary.undeliveredReceipts} وصل لم يُسلَّم
      </span>
    ) : r.dto.paymentsCount > 0 ? (
      <ReceiptBadge issued />
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )
  const paymentsCell = (r: ObligationRow) =>
    r.dto.paymentsCount > 0 ? <span className="text-sm">{r.dto.paymentsCount} دفعة</span> : <span className="text-muted-foreground">—</span>

  const columns: Column<ObligationRow>[] = [
    {
      id: "student",
      header: "الطالب",
      cell: (r) => (
        <Link href={`/admin/students/${r.dto.student.id}?tab=payments`} className="block hover:opacity-80">
          <PersonCell name={studentName(r)} size="sm" />
        </Link>
      ),
    },
    { id: "group", header: "المجموعة", cell: (r) => <span className="whitespace-nowrap">{r.dto.group.name}</span> },
    { id: "expected", header: "المطلوب", cell: (r) => <span className="tabular-nums whitespace-nowrap">{formatMoney(r.summary.expected)}</span> },
    { id: "paid", header: "المدفوع", cell: (r) => <span className="tabular-nums whitespace-nowrap">{formatMoney(r.summary.paid)}</span> },
    { id: "remaining", header: "المتبقي", cell: (r) => <span className="tabular-nums whitespace-nowrap">{formatMoney(r.summary.remaining)}</span> },
    { id: "status", header: "حالة الدفع", cell: (r) => <PaymentStatusBadge status={r.summary.status} /> },
    { id: "payments", header: "الدفعات", className: "hidden lg:table-cell", cell: paymentsCell },
    { id: "receipt", header: "الوصل", cell: receiptCell },
    {
      id: "actions",
      header: <span className="sr-only">الإجراءات</span>,
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setHistory(r)} aria-label={`سجل دفعات ${studentName(r)}`}>
            <History />
          </Button>
          {recordButton(r)}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="المدفوعات" description="متابعة إدارية لمعاليم المجموعات والدفعات النقدية والوصولات — للاطلاع فقط، دون أي إلزام أو حجب." />
      <div className="mb-4">
        <AcademicYearSelect value={academicYearId} onChange={reset(setAcademicYearId)} years={academicYears} />
      </div>
      {!academicYearId ? (
        <Card className="p-0">
          <EmptyState icon={Wallet} title="لا توجد سنة دراسية" description="أضف سنة دراسية من الإعدادات لمتابعة المعاليم." />
        </Card>
      ) : (
        <>
          <section aria-label="ملخص" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="المبلغ المطلوب" value={<span className="whitespace-nowrap">{totals ? formatMoney(money(totals.totals.expectedAmount)) : "…"}</span>} icon={Wallet} />
            <StatCard label="المبلغ المدفوع" value={<span className="whitespace-nowrap">{totals ? formatMoney(money(totals.totals.totalPaid)) : "…"}</span>} icon={Banknote} />
            <StatCard label="المبلغ المتبقي" value={<span className="whitespace-nowrap">{totals ? formatMoney(money(totals.totals.remainingAmount)) : "…"}</span>} icon={CircleDashed}
              hint={totals ? `${totals.statusCounts.UNPAID + totals.statusCounts.PARTIAL} طالب لم يكتمل دفعهم` : undefined} />
            <StatCard label="وصولات لم يتم تسليمها" value={totals?.collected.receiptsNotIssued ?? "…"} icon={ReceiptText}
              className={totals && totals.collected.receiptsNotIssued > 0 ? "border-warning/40" : undefined} />
          </section>

          <FilterBar
            hasActiveFilters={hasFilters}
            onReset={() => {
              setQuery("")
              setGroupId(ALL)
              setStatus(ALL)
              setPage(1)
            }}
            resultLabel={list.data ? `${list.data.meta.total} طالب` : ""}
            search={<SearchInput value={query} onChange={reset(setQuery)} label="البحث عن طالب" placeholder="ابحث باسم الطالب…" />}
          >
            <FilterSelect label="المجموعة" allLabel="كل المجموعات" value={groupId} onValueChange={reset(setGroupId)}
              options={lookups.groups.filter((g) => g.status !== "ARCHIVED").map((g) => ({ value: g.id, label: g.name }))} />
            <FilterSelect label="حالة الدفع" allLabel="كل الحالات" value={status} onValueChange={reset(setStatus)}
              options={(["PAID", "PARTIAL", "UNPAID"] as PaymentStatus[]).map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))} />
          </FilterBar>

          <QueryState query={list}>
            <DataTable
              key={[academicYearId, query, groupId, status, page].join("|")}
              caption="المدفوعات حسب الطالب"
              columns={columns}
              rows={rows}
              getRowId={(r) => r.summary.obligation.id}
              emptyState={<EmptyState icon={hasFilters ? SearchX : Users} title={hasFilters ? "لا توجد نتائج مطابقة" : "لا توجد معاليم لهذه السنة"} />}
              renderMobileCard={(r) => (
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/students/${r.dto.student.id}?tab=payments`} className="min-w-0">
                      <PersonCell name={studentName(r)} size="sm" secondary={r.dto.group.name} />
                    </Link>
                    <PaymentStatusBadge status={r.summary.status} />
                  </div>
                  <ObligationFigures summary={r.summary} className="text-sm" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {receiptCell(r)}
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setHistory(r)}>
                        <History />
                        السجل
                      </Button>
                      {recordButton(r)}
                    </div>
                  </div>
                </div>
              )}
            />
            <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
          </QueryState>
        </>
      )}

      <Dialog open={history != null} onOpenChange={(open) => !open && setHistory(null)}>
        <DialogContent className="sm:max-w-lg">
          {history && (
            <>
              <DialogHeader>
                <DialogTitle>سجل دفعات {studentName(history)}</DialogTitle>
                <DialogDescription>{`${history.fee.label} · ${feeDescription(history.fee)}`}</DialogDescription>
              </DialogHeader>
              <ObligationFigures summary={history.summary} />
              <div className="max-h-80 overflow-y-auto">
                <ObligationHistory row={history} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {recorder.render()}
    </>
  )
}

/** "معلوم المجموعة": the group's pricing rules, one per academic year. */
export function GroupFees({ group, today }: { group: Group; today: ISODate }) {
  const academicYears = useAcademicYears()
  const query = useGroupFees(group.id)
  const deactivate = useDeactivateGroupFee()
  const [editor, setEditor] = useState<{ fee?: GroupFee; key: number; open: boolean }>({ key: 0, open: false })
  // Newest version first (the API keeps the history of each year's fee)
  const fees = query.data ?? []
  const yearLabel = (id?: ID) => academicYears.find((y) => y.id === id)?.label

  return (
    <SectionCard
      title="معلوم المجموعة"
      icon={Wallet}
      action={
        <Button size="sm" variant="outline" onClick={() => setEditor((p) => ({ key: p.key + 1, open: true }))}>
          <Plus />
          إضافة معلوم
        </Button>
      }
    >
      {!query.data ? (
        <QueryState query={query}>{null}</QueryState>
      ) : fees.length === 0 ? (
        <p className="text-sm text-muted-foreground">لم يُحدَّد معلوم لهذه المجموعة بعد.</p>
      ) : (
        <ul className="divide-y">
          {fees.map((fee) => (
            <li key={fee.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-muted-foreground">السنة الدراسية</dt><dd className="font-medium" dir="ltr">{yearLabel(fee.academicYearId) ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">طريقة الدفع</dt><dd className="font-medium">{labels.billingType[fee.billingType]}</dd></div>
                <div>
                  <dt className="text-xs text-muted-foreground">{fee.billingType === "MONTHLY" ? "المبلغ الشهري" : "المبلغ"}</dt>
                  <dd className="font-medium tabular-nums">{formatMoney(fee.amount)}</dd>
                </div>
                {fee.billingType === "MONTHLY" ? (
                  <div><dt className="text-xs text-muted-foreground">عدد الأشهر · المجموع</dt><dd className="font-medium tabular-nums">{feePeriods(fee)} · {formatMoney(feeTotal(fee))}</dd></div>
                ) : (
                  <div><dt className="text-xs text-muted-foreground">المجموع</dt><dd className="font-medium tabular-nums">{formatMoney(feeTotal(fee))}</dd></div>
                )}
              </dl>
              <div className="flex items-center gap-2">
                {!fee.isActive && <Badge variant="outline" className="font-normal">غير مفعّل</Badge>}
                {fee.isActive && (
                  <>
                    <Button size="icon" variant="ghost" aria-label={`تعديل ${fee.label}`} onClick={() => setEditor((p) => ({ fee, key: p.key + 1, open: true }))}>
                      <Pencil />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      disabled={deactivate.isPending}
                      onClick={() =>
                        deactivate.mutate(fee.id, {
                          onSuccess: () => toast.success("أُوقف المعلوم", { description: "الالتزامات المسجّلة تبقى كما هي." }),
                          onError: (error) => toast.error(errorMessage(error)),
                        })
                      }
                    >
                      إيقاف
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <GroupFeeDialog
        key={editor.key}
        open={editor.open}
        onOpenChange={(open) => setEditor((p) => ({ ...p, open }))}
        group={group}
        fee={editor.fee}
        today={today}
      />
    </SectionCard>
  )
}

function GroupFeeDialog({
  open,
  onOpenChange,
  group,
  fee,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  fee?: GroupFee
  today: ISODate
}) {
  const academicYears = useAcademicYears()
  const save = useSetGroupFee(group.id)
  const current = defaultPeriod(academicYears, today).academicYearId
  const [label, setLabel] = useState(fee?.label ?? `معلوم السنة ${academicYears.find((y) => y.id === current)?.label ?? ""}`)
  const [pickedYearId, setAcademicYearId] = useState<string>()
  const academicYearId = pickedYearId ?? fee?.academicYearId ?? current
  const [billingType, setBillingType] = useState<BillingType>(fee?.billingType ?? "YEARLY")
  const [amount, setAmount] = useState(fee ? String(fee.amount) : "")
  const [periods, setPeriods] = useState(String(fee?.numberOfPeriods ?? 2))
  const [submitted, setSubmitted] = useState(false)
  const errors = {
    label: !label.trim() ? "التسمية مطلوبة" : undefined,
    amount: !(Number(amount) > 0) ? "أدخل مبلغًا أكبر من صفر" : undefined,
    periods: billingType === "MONTHLY" && !(Number.isInteger(Number(periods)) && Number(periods) >= 1 && Number(periods) <= 12) ? "عدد الأشهر بين 1 و12" : undefined,
    year: !academicYearId ? "اختر السنة الدراسية" : undefined,
  }
  const preview = Number(amount) > 0 ? feeTotal({ amount: Number(amount), billingType, numberOfPeriods: Number(periods) || 1 }) : 0

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(true)
            if (save.isPending || Object.values(errors).some(Boolean)) return
            save.mutate(
              {
                academicYearId,
                label: label.trim(),
                billingType,
                amount: Number(amount),
                numberOfPeriods: billingType === "MONTHLY" ? Number(periods) : 1,
              },
              {
                onSuccess: () => {
                  onOpenChange(false)
                  toast.success(fee ? "تم تعديل المعلوم" : "تمت إضافة المعلوم", {
                    description: "الالتزامات المسجّلة سابقًا تحتفظ بمبالغها. تُنشأ التزامات الطلبة من ملف كل طالب.",
                  })
                },
              }
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>{fee ? "تعديل معلوم المجموعة" : "معلوم جديد"}</DialogTitle>
            <DialogDescription>{group.name} — يسري على كل فصول المجموعة.</DialogDescription>
          </DialogHeader>
          <FormField id="fee-label" label="التسمية" required error={submitted ? errors.label : undefined}>
            <Input id="fee-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="fee-year" label="السنة الدراسية" required error={submitted ? errors.year : undefined}>
              <AcademicYearSelect value={academicYearId} onChange={setAcademicYearId} years={academicYears} className="sm:w-full" />
            </FormField>
            <FormField id="fee-billing" label="طريقة الدفع" required>
              <Select value={billingType} onValueChange={(v) => setBillingType(v as BillingType)}>
                <SelectTrigger id="fee-billing" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="YEARLY">{labels.billingType.YEARLY}</SelectItem>
                  <SelectItem value="MONTHLY">{labels.billingType.MONTHLY}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField id="fee-amount" label={billingType === "MONTHLY" ? "المبلغ الشهري (د.ت)" : "المبلغ (د.ت)"} required error={submitted ? errors.amount : undefined}>
              <Input id="fee-amount" type="number" min={0} step="0.5" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            {billingType === "MONTHLY" && (
              <FormField id="fee-periods" label="عدد الأشهر" required error={submitted ? errors.periods : undefined}>
                <Input id="fee-periods" type="number" min={1} max={12} dir="ltr" value={periods} onChange={(e) => setPeriods(e.target.value)} />
              </FormField>
            )}
          </div>
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            المجموع المطلوب من كل طالب: <span className="font-semibold tabular-nums">{formatMoney(preview)}</span>
          </p>
          {fee && <p className="text-xs text-muted-foreground">يُحفظ التعديل كإصدار جديد للمعلوم؛ الالتزامات المسجّلة سابقًا للطلبة لا تتغيّر.</p>}
          {save.isError && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage(save.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>{labels.common.cancel}</Button>
            <Button type="submit" className="min-w-24" disabled={save.isPending}>{labels.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
