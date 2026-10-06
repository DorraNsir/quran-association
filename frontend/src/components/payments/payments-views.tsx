"use client"

import { Banknote, CircleDashed, History, Pencil, Plus, ReceiptText, SearchX, Users, Wallet } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
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
import { groupClassLabel } from "@/lib/communication"
import { describeClass, fullName, indexLookups, type Lookups } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { defaultPeriod } from "@/lib/memorization"
import {
  feePeriods,
  feeTotal,
  formatMoney,
  getObligationSummary,
  getPaymentSummary,
  PAYMENT_STATUS_LABEL,
  type ObligationSummary,
  type PaymentStatus,
} from "@/lib/payments"
import { allStudents, operations, useOperations } from "@/lib/store/operations"
import type { AcademicYear, BillingType, Group, GroupFee, ID, ISODate, Student } from "@/types/domain"

import { ObligationFigures, PaymentHistory, PaymentStatusBadge, ReceiptBadge, useRecordPayment } from "./payment-parts"

/** "120 د.ت · سنوي" or "20 د.ت × 2 أشهر = 40 د.ت". */
export function feeDescription(fee: GroupFee) {
  return fee.billingType === "MONTHLY"
    ? `${formatMoney(fee.amount)} شهريًا × ${feePeriods(fee)} = ${formatMoney(feeTotal(fee))}`
    : `${formatMoney(fee.amount)} · ${labels.billingType.YEARLY}`
}

/**
 * One student's obligations per academic year (expected / paid / remaining
 * + every payment with its receipt). Admin can record payments and mark
 * receipts delivered; the student only consults their own data.
 */
export function StudentPayments({
  studentId,
  mode,
  userId,
  academicYears,
  today,
}: {
  studentId: ID
  mode: "admin" | "student"
  /** Admin recording payments */
  userId?: ID
  academicYears: AcademicYear[]
  today: ISODate
}) {
  const state = useOperations()
  const recorder = useRecordPayment()
  const student = allStudents(state).find((s) => s.id === studentId)
  const yearsById = new Map(academicYears.map((y) => [y.id, y]))
  const summaries = state.paymentObligations
    .filter((o) => o.studentId === studentId)
    .sort((a, b) => (b.academicYearId ?? "").localeCompare(a.academicYearId ?? ""))
    .map((o) => getObligationSummary(o, state.payments))

  if (summaries.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState icon={Wallet} title="لا يوجد معلوم مسجّل" description="لم يُحدَّد بعد معلوم للمجموعة التي يدرس فيها الطالب." />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {summaries.map((summary) => {
        const fee = state.groupFees.find((f) => f.id === summary.obligation.groupFeeId)
        const year = summary.obligation.academicYearId ? yearsById.get(summary.obligation.academicYearId) : undefined
        return (
          <SectionCard
            key={summary.obligation.id}
            title={fee?.label ?? "المعلوم"}
            icon={Wallet}
            action={<PaymentStatusBadge status={summary.status} />}
          >
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {year && <><span dir="ltr">{year.label}</span> · </>}
                {fee ? feeDescription(fee) : formatMoney(summary.expected)}
              </p>
              <ObligationFigures summary={summary} />
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <History className="size-4 text-muted-foreground" aria-hidden />
                  سجل الدفعات ({summary.payments.length})
                </p>
                {mode === "admin" && summary.remaining > 0 && student && (
                  <Button size="sm" onClick={() => recorder.open(summary, fee, fullName(student))}>
                    <Plus />
                    تسجيل دفعة
                  </Button>
                )}
              </div>
              <PaymentHistory payments={[...summary.payments].reverse()} canEdit={mode === "admin"} />
            </div>
          </SectionCard>
        )
      })}
      {mode === "admin" && userId && recorder.render(userId, today)}
    </div>
  )
}

interface Row {
  student: Student
  summary: ObligationSummary
  fee?: GroupFee
  groupName: string
  classLabel: string
  groupId?: ID
}

/** Association-wide, informational payment tracking (no deadlines, no blocking). */
export function PaymentsOverview({
  userId,
  lookups,
  academicYears,
  today,
}: {
  userId: ID
  lookups: Lookups
  academicYears: AcademicYear[]
  today: ISODate
}) {
  const state = useOperations()
  const recorder = useRecordPayment()
  const [academicYearId, setAcademicYearId] = useState(defaultPeriod(academicYears, today).academicYearId)
  const [query, setQuery] = useState("")
  const [groupId, setGroupId] = useState(ALL)
  const [classId, setClassId] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [receipt, setReceipt] = useState(ALL)
  const [history, setHistory] = useState<Row | null>(null)

  const indexes = indexLookups(lookups)
  const studentsById = new Map(allStudents(state).map((s) => [s.id, s]))
  const rows: Row[] = state.paymentObligations
    .filter((o) => o.academicYearId === academicYearId)
    .flatMap((o) => {
      const student = studentsById.get(o.studentId)
      if (!student) return []
      const groupClass = indexes.classesById.get(student.groupClassId)
      const view = groupClass ? describeClass(groupClass, indexes) : undefined
      return [{
        student,
        summary: getObligationSummary(o, state.payments),
        fee: state.groupFees.find((f) => f.id === o.groupFeeId),
        groupName: view?.group?.name ?? "—",
        classLabel: view ? `${view.branch?.name ?? ""} — ${view.supervisor ? fullName(view.supervisor) : "—"}` : "—",
        groupId: view?.group?.id,
      }]
    })
    .sort((a, b) => fullName(a.student).localeCompare(fullName(b.student), "ar"))
  const filtered = rows.filter(
    (r) =>
      (!query.trim() || matchesText(fullName(r.student), query)) &&
      (groupId === ALL || r.groupId === groupId) &&
      (classId === ALL || r.student.groupClassId === classId) &&
      (status === ALL || r.summary.status === status) &&
      (receipt === ALL || (receipt === "PENDING" ? r.summary.undeliveredReceipts > 0 : r.summary.payments.length > 0 && r.summary.undeliveredReceipts === 0))
  )
  const totals = getPaymentSummary(filtered.map((r) => r.summary))
  const groupClasses = groupId === ALL ? [] : lookups.groupClasses.filter((c) => c.groupId === groupId)
  const hasFilters = Boolean(query) || [groupId, classId, status, receipt].some((v) => v !== ALL)
  const historyRow = history && rows.find((r) => r.summary.obligation.id === history.summary.obligation.id)

  const recordButton = (r: Row) =>
    r.summary.remaining > 0 ? (
      <Button size="sm" variant="outline" onClick={() => recorder.open(r.summary, r.fee, fullName(r.student))}>
        <Plus />
        تسجيل دفعة
      </Button>
    ) : null
  const receiptCell = (r: Row) =>
    r.summary.undeliveredReceipts > 0 ? (
      <span className="inline-flex items-center gap-1 text-xs text-warning whitespace-nowrap">
        <CircleDashed className="size-3.5" aria-hidden />
        {r.summary.undeliveredReceipts} وصل لم يُسلَّم
      </span>
    ) : r.summary.payments.length > 0 ? (
      <ReceiptBadge issued />
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )
  const lastPayment = (r: Row) =>
    r.summary.lastPayment ? (
      <span className="whitespace-nowrap text-sm">
        <span className="tabular-nums">{formatMoney(r.summary.lastPayment.amount)}</span>
        <span className="block text-xs text-muted-foreground">{formatDate(r.summary.lastPayment.paidAt)} · {r.summary.payments.length} دفعة</span>
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    )

  const columns: Column<Row>[] = [
    {
      id: "student",
      header: "الطالب",
      cell: (r) => (
        <Link href={`/admin/students/${r.student.id}?tab=payments`} className="block hover:opacity-80">
          <PersonCell name={fullName(r.student)} photoUrl={r.student.photoUrl} size="sm" />
        </Link>
      ),
    },
    { id: "group", header: "المجموعة", cell: (r) => <span className="whitespace-nowrap">{r.groupName}</span> },
    //{ id: "class", header: "الفصل", className: "hidden xl:table-cell", cell: (r) => <span className="text-sm text-muted-foreground">{r.classLabel}</span> },
    { id: "expected", header: "المطلوب", cell: (r) => <span className="tabular-nums whitespace-nowrap">{formatMoney(r.summary.expected)}</span> },
    { id: "paid", header: "المدفوع", cell: (r) => <span className="tabular-nums whitespace-nowrap">{formatMoney(r.summary.paid)}</span> },
    { id: "remaining", header: "المتبقي", cell: (r) => <span className="tabular-nums whitespace-nowrap">{formatMoney(r.summary.remaining)}</span> },
    { id: "status", header: "حالة الدفع", cell: (r) => <PaymentStatusBadge status={r.summary.status} /> },
    { id: "last", header: "آخر دفعة", className: "hidden lg:table-cell", cell: lastPayment },
    { id: "receipt", header: "الوصل", cell: receiptCell },
    {
      id: "actions",
      header: <span className="sr-only">الإجراءات</span>,
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setHistory(r)} aria-label={`سجل دفعات ${fullName(r.student)}`}>
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
        <AcademicYearSelect value={academicYearId} onChange={setAcademicYearId} years={academicYears} />
      </div>
      <section aria-label="ملخص" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="المبلغ المطلوب" value={<span className="whitespace-nowrap">{formatMoney(totals.expected)}</span>} icon={Wallet} />
        <StatCard label="المبلغ المدفوع" value={<span className="whitespace-nowrap">{formatMoney(totals.paid)}</span>} icon={Banknote} />
        <StatCard label="المبلغ المتبقي" value={<span className="whitespace-nowrap">{formatMoney(totals.remaining)}</span>} icon={CircleDashed} hint={`${totals.notFullyPaid} طالب لم يكتمل دفعهم`} />
        <StatCard label="وصولات لم يتم تسليمها" value={totals.undeliveredReceipts} icon={ReceiptText}
          className={totals.undeliveredReceipts > 0 ? "border-warning/40" : undefined} />
      </section>

      <FilterBar
        hasActiveFilters={hasFilters}
        onReset={() => {
          setQuery("")
          setGroupId(ALL)
          setClassId(ALL)
          setStatus(ALL)
          setReceipt(ALL)
        }}
        resultLabel={`${filtered.length} طالب`}
        search={<SearchInput value={query} onChange={setQuery} label="البحث عن طالب" placeholder="ابحث باسم الطالب…" />}
      >
        <FilterSelect label="المجموعة" allLabel="كل المجموعات" value={groupId}
          onValueChange={(v) => {
            setGroupId(v)
            setClassId(ALL)
          }}
          options={[...new Set(rows.map((r) => r.groupId).filter(Boolean))].map((id) => ({ value: id!, label: lookups.groups.find((g) => g.id === id)?.name ?? "—" }))} />
        {groupClasses.length > 1 && (
          <FilterSelect label="الفصل" allLabel="كل الفصول" value={classId} onValueChange={setClassId}
            options={groupClasses.map((c) => ({ value: c.id, label: groupClassLabel(c, lookups) }))} />
        )}
        <FilterSelect label="حالة الدفع" allLabel="كل الحالات" value={status} onValueChange={setStatus}
          options={(["PAID", "PARTIAL", "UNPAID"] as PaymentStatus[]).map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))} />
        <FilterSelect label="حالة الوصل" allLabel="كل الوصولات" value={receipt} onValueChange={setReceipt}
          options={[{ value: "PENDING", label: "لم يتم تسليم الوصل" }, { value: "DONE", label: "تم تسليم الوصل" }]} />
      </FilterBar>

      <DataTable
        key={[academicYearId, query, groupId, classId, status, receipt].join("|")}
        caption="المدفوعات حسب الطالب"
        columns={columns}
        rows={filtered}
        getRowId={(r) => r.summary.obligation.id}
        pageSize={20}
        emptyState={<EmptyState icon={rows.length === 0 ? Users : SearchX} title={rows.length === 0 ? "لا توجد معاليم لهذه السنة" : "لا توجد نتائج مطابقة"} />}
        renderMobileCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/admin/students/${r.student.id}?tab=payments`} className="min-w-0">
                <PersonCell name={fullName(r.student)} photoUrl={r.student.photoUrl} size="sm" secondary={`${r.groupName} · ${r.classLabel}`} />
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

      <Dialog open={historyRow != null} onOpenChange={(open) => !open && setHistory(null)}>
        <DialogContent className="sm:max-w-lg">
          {historyRow && (
            <>
              <DialogHeader>
                <DialogTitle>سجل دفعات {fullName(historyRow.student)}</DialogTitle>
                <DialogDescription>{historyRow.fee ? `${historyRow.fee.label} · ${feeDescription(historyRow.fee)}` : historyRow.groupName}</DialogDescription>
              </DialogHeader>
              <ObligationFigures summary={historyRow.summary} />
              <div className="max-h-80 overflow-y-auto">
                <PaymentHistory payments={[...historyRow.summary.payments].reverse()} canEdit />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {recorder.render(userId, today)}
    </>
  )
}

/** "معلوم المجموعة": the group's pricing rules, one per academic year. */
export function GroupFees({ group, academicYears, today }: { group: Group; academicYears: AcademicYear[]; today: ISODate }) {
  const { groupFees } = useOperations()
  const [editor, setEditor] = useState<{ fee?: GroupFee; key: number; open: boolean }>({ key: 0, open: false })
  const fees = groupFees.filter((f) => f.groupId === group.id).sort((a, b) => (b.academicYearId ?? "").localeCompare(a.academicYearId ?? ""))
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
      {fees.length === 0 ? (
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
                <Button size="icon" variant="ghost" aria-label={`تعديل ${fee.label}`} onClick={() => setEditor((p) => ({ fee, key: p.key + 1, open: true }))}>
                  <Pencil />
                </Button>
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
        academicYears={academicYears}
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
  academicYears,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  fee?: GroupFee
  academicYears: AcademicYear[]
  today: ISODate
}) {
  const { groupFees } = useOperations()
  const current = defaultPeriod(academicYears, today).academicYearId
  const [label, setLabel] = useState(fee?.label ?? `معلوم السنة ${academicYears.find((y) => y.id === current)?.label ?? ""}`)
  const [academicYearId, setAcademicYearId] = useState(fee?.academicYearId ?? current)
  const [billingType, setBillingType] = useState<BillingType>(fee?.billingType ?? "YEARLY")
  const [amount, setAmount] = useState(fee ? String(fee.amount) : "")
  const [periods, setPeriods] = useState(String(fee?.numberOfPeriods ?? 2))
  const [isActive, setIsActive] = useState(fee?.isActive ?? true)
  const [submitted, setSubmitted] = useState(false)
  const duplicate = groupFees.some((f) => f.groupId === group.id && f.academicYearId === academicYearId && f.isActive && f.id !== fee?.id) && isActive
  const errors = {
    label: !label.trim() ? "التسمية مطلوبة" : undefined,
    amount: !(Number(amount) > 0) ? "أدخل مبلغًا أكبر من صفر" : undefined,
    periods: billingType === "MONTHLY" && !(Number.isInteger(Number(periods)) && Number(periods) >= 1 && Number(periods) <= 12) ? "عدد الأشهر بين 1 و12" : undefined,
    year: duplicate ? "يوجد معلوم مفعّل لهذه المجموعة في نفس السنة" : undefined,
  }
  const preview = Number(amount) > 0 ? feeTotal({ amount: Number(amount), billingType, numberOfPeriods: Number(periods) || 1 }) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(true)
            if (Object.values(errors).some(Boolean)) return
            operations.saveGroupFee(
              {
                id: fee?.id,
                groupId: group.id,
                academicYearId,
                label: label.trim(),
                billingType,
                amount: Number(amount),
                numberOfPeriods: billingType === "MONTHLY" ? Number(periods) : 1,
                startDate: fee?.startDate,
                endDate: fee?.endDate,
                isActive,
              },
              today
            )
            onOpenChange(false)
            toast.success(fee ? "تم تعديل المعلوم" : "تمت إضافة المعلوم", {
              description: fee ? "الالتزامات المسجّلة سابقًا تحتفظ بمبالغها." : "أُنشئت التزامات طلبة المجموعة لهذه السنة.",
            })
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
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            المعلوم مفعّل
          </label>
          {fee && <p className="text-xs text-muted-foreground">تعديل المبلغ لا يغيّر الالتزامات المسجّلة سابقًا للطلبة.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{labels.common.cancel}</Button>
            <Button type="submit" className="min-w-24">{labels.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
