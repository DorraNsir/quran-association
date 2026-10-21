"use client"

import { Banknote, CircleDashed, History, Loader2, Pencil, Plus, ReceiptText, SearchX, Users, Wallet } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters"
import { FormField } from "@/components/shared/form"
import { FormErrorAlert } from "@/components/shared/form-error-alert"
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
  fetchRepricePreview,
  money,
  type RepricePreviewDto,
  type RepriceProtection,
  toObligationRow,
  toPayment,
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
import { formatDate } from "@/lib/format"
import type { AcademicYear, Group, GroupFee, ID, ISODate } from "@/types/domain"

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
 * record payments and mark receipts delivered (the group's fee is charged
 * automatically when the student joins it); the student only consults
 * their own data.
 */
export function StudentPayments({ studentId, mode }: { studentId?: ID; mode: "admin" | "student"; groupClassId?: ID }) {
  const recorder = useRecordPayment()
  const { rows, queries } = useStudentFinance(mode, studentId)
  if (!rows) return <QueryState query={queries}>{null}</QueryState>

  if (rows.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={Wallet}
          title="لا يوجد معلوم مسجّل"
          description="لم يُحدَّد بعد معلوم للمجموعة التي يدرس فيها الطالب. عند تحديده يُضاف إلى الطالب تلقائيًا."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {rows.map(({ summary, fee: rowFee, dto }) => (
        <SectionCard
          key={summary.obligation.id}
          title={`${rowFee.label } — ${dto.group.name}`}
          icon={Wallet}
          action={<PaymentStatusBadge status={summary.status} />}
        >
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
    {
      id: "paid",
      header: "المدفوع",
      cell: (r) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatMoney(r.summary.paid)}
          {Boolean(r.summary.creditIn) && (
            <span className="block text-xs text-muted-foreground">+ رصيد محوّل {formatMoney(r.summary.creditIn!)}</span>
          )}
        </span>
      ),
    },
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
            <StatCard label="المبلغ المدفوع" value={<span className="whitespace-nowrap">{totals ? formatMoney(money(totals.totals.totalPaid)) : "…"}</span>} icon={Banknote}
              hint={totals && Number(totals.totals.creditAmount ?? 0) !== 0
                ? `نقدًا؛ رصيد محوّل بين المجموعات: ${formatMoney(money(totals.totals.creditAmount!))}`
                : "نقدًا"} />
            <StatCard label="المبلغ المتبقي" value={<span className="whitespace-nowrap">{totals ? formatMoney(money(totals.totals.remainingAmount)) : "…"}</span>} icon={CircleDashed}
              hint={totals
                ? [
                    `${totals.statusCounts.UNPAID + totals.statusCounts.PARTIAL} طالب لم يكتمل دفعهم`,
                    ...(Number(totals.totals.excessAmount ?? 0) > 0 ? [`رصيد زائد: ${formatMoney(money(totals.totals.excessAmount!))}`] : []),
                  ].join(" · ")
                : undefined} />
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
              options={(["PAID", "PARTIAL", "UNPAID", "CLOSED"] as PaymentStatus[]).map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))} />
          </FilterBar>

          <QueryState query={list}>
            <DataTable
              key={[academicYearId, query, groupId, status, page].join("|")}
              caption="المدفوعات حسب الطالب"
              columns={columns}
              rows={rows}
              getRowId={(r) => r.summary.obligation.id}
              emptyState={
                <EmptyState
                  icon={hasFilters ? SearchX : Users}
                  title={hasFilters ? "لا توجد نتائج مطابقة" : "لا توجد معاليم لهذه السنة"}
                  description={hasFilters ? undefined : "يظهر هنا تلقائيًا كل طالب نشط في مجموعة حُدِّد لها معلوم لهذه السنة."}
                />
              }
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

/** «سجل التعديلات»: why a version is no longer the current one */
const FEE_STATUS_LABEL = { REPLACED: "استُبدل", STOPPED: "موقوف" } as const

/**
 * "معلوم المجموعة": ONE current fee per academic year — the total required
 * from each student — with its earlier versions under «سجل التعديلات».
 */
export function GroupFees({ group, today }: { group: Group; today: ISODate }) {
  const academicYears = useAcademicYears()
  const query = useGroupFees(group.id)
  const deactivate = useDeactivateGroupFee()
  const [editor, setEditor] = useState<{ fee?: GroupFee; academicYearId?: ID; key: number; open: boolean }>({ key: 0, open: false })
  const [stopping, setStopping] = useState<GroupFee | null>(null)
  const open = (fee?: GroupFee, academicYearId?: ID) => setEditor((p) => ({ fee, academicYearId, key: p.key + 1, open: true }))
  // Newest version first (the API keeps the history of each year's fee)
  const fees = query.data ?? []
  const yearOf = (id?: ID) => academicYears.find((y) => y.id === id)
  const years = [...new Set(fees.map((f) => f.academicYearId))].sort((a, b) =>
    (yearOf(b)?.startDate ?? "").localeCompare(yearOf(a)?.startDate ?? "")
  )
  // A year can get a fee only when it has no current one
  const freeYears = academicYears.filter((y) => !fees.some((f) => f.academicYearId === y.id && f.isActive))

  return (
    <SectionCard
      title="معلوم المجموعة"
      icon={Wallet}
      action={
        freeYears.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => open()}>
            <Plus />
            تحديد المعلوم
          </Button>
        ) : undefined
      }
    >
      {!query.data ? (
        <QueryState query={query}>{null}</QueryState>
      ) : fees.length === 0 ? (
        <p className="text-sm text-muted-foreground">لم يُحدَّد معلوم لهذه المجموعة بعد.</p>
      ) : (
        <div className="space-y-5">
          {years.map((yearId) => {
            const versions = fees.filter((f) => f.academicYearId === yearId)
            const active = versions.find((f) => f.isActive)
            const history = versions.filter((f) => !f.isActive)
            return (
              <section key={yearId ?? "none"} className="space-y-3" aria-label={`معلوم السنة ${yearOf(yearId)?.label ?? ""}`}>
                <p className="text-xs font-medium text-muted-foreground">
                  السنة الدراسية <span dir="ltr">{yearOf(yearId)?.label ?? "—"}</span>
                </p>
                {active ? (
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-3">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">{active.label}</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {formatMoney(feeTotal(active))}
                        <span className="ms-2 text-xs font-normal text-muted-foreground">     لكل طالب</span>
                      </p>
                      {active.billingType === "MONTHLY" && <p className="text-xs text-muted-foreground">{feeDescription(active)}</p>}
                      <p className="text-xs text-muted-foreground">ساري منذ {formatDate(active.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => open(active)}>
                        <Pencil />
                        تعديل المعلوم
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setStopping(active)}>
                        إيقاف
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
                    <p className="text-sm text-muted-foreground">لا يوجد معلوم ساري لهذه السنة.</p>
                    <Button size="sm" variant="outline" onClick={() => open(undefined, yearId)}>
                      <Plus />
                      تحديد المعلوم
                    </Button>
                  </div>
                )}
                {history.length > 0 && (
                  <details className="group rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                    <summary className="cursor-pointer select-none font-medium">سجل التعديلات ({history.length})</summary>
                    <ol className="mt-2 divide-y">
                      {history.map((fee) => {
                        // The version that took over (the next newer one of the year)
                        const next = versions[versions.indexOf(fee) - 1]
                        return (
                          <li key={fee.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div>
                              <p className="tabular-nums">
                                {formatMoney(feeTotal(fee))}
                                {fee.status === "REPLACED" && next && (
                                  <span className="text-muted-foreground"> ← {formatMoney(feeTotal(next))}</span>
                                )}
                                <span className="ms-2 text-xs text-muted-foreground">{fee.label}</span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                من {formatDate(fee.createdAt)}
                                {fee.deactivatedAt && <> إلى {formatDate(fee.deactivatedAt)}</>}
                              </p>
                            </div>
                            {fee.status && fee.status !== "ACTIVE" && (
                              <Badge variant="outline" className="font-normal">
                                {FEE_STATUS_LABEL[fee.status]}
                              </Badge>
                            )}
                          </li>
                        )
                      })}
                    </ol>
                  </details>
                )}
              </section>
            )
          })}
        </div>
      )}
      <GroupFeeDialog
        key={editor.key}
        open={editor.open}
        onOpenChange={(open) => setEditor((p) => ({ ...p, open }))}
        group={group}
        fee={editor.fee}
        academicYearId={editor.academicYearId}
        freeYears={freeYears}
        today={today}
      />
      {stopping && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setStopping(null)}
          title="إيقاف المعلوم؟"
          description={`يتوقّف إضافة معلوم «${stopping.label}» (${formatMoney(feeTotal(stopping))}) تلقائيًا إلى الطلبة الذين ينضمّون إلى المجموعة في هذه السنة. المبالغ المسجّلة للطلبة الحاليين ودفعاتهم لا تتغيّر. لا يمكن إعادة تفعيل المعلوم الموقوف، ويمكن تحديد معلوم جديد لاحقًا.`}
          confirmLabel="إيقاف المعلوم"
          destructive
          onConfirm={() =>
            deactivate.mutateAsync(stopping.id).then(() => {
              toast.success("أُوقف المعلوم", { description: "المبالغ المسجّلة للطلبة والدفعات تبقى كما هي." })
              setStopping(null)
            })
          }
        />
      )}
    </SectionCard>
  )
}

/** Why an obligation keeps its amount when the fee changes («سيتم تحديث…، بينما ستبقى…») */
const REPRICE_PROTECTION_LABEL: Record<RepriceProtection, string> = {
  HAS_PAYMENTS: "لوجود دفعات مسجّلة",
  HAS_VOIDED_PAYMENTS: "لوجود دفعات ملغاة في سجلها",
  HAS_TRANSFER_CREDIT: "لارتباطها بنقل من مجموعة أخرى",
  STUDENT_INACTIVE: "لأن الطالب غير نشط",
  LEFT_GROUP: "لأن الطالب غادر المجموعة",
}
const studentsCount = (n: number) => (n === 1 ? "طالب واحد" : n === 2 ? "طالبين" : `${n} طلبة`)

/** «سيتم تحديث المبلغ المطلوب لـ 8 طلبة، بينما ستبقى مستحقات 3 طلبة دون تغيير لوجود دفعات مسجّلة.» */
export function repriceSentence(preview: Pick<RepricePreviewDto, "toUpdate" | "protected">) {
  const byReason = new Map<RepriceProtection, number>()
  for (const p of preview.protected) byReason.set(p.reasons[0], (byReason.get(p.reasons[0]) ?? 0) + 1)
  const why = [...byReason].map(([reason, n]) =>
    byReason.size === 1 ? REPRICE_PROTECTION_LABEL[reason] : `${studentsCount(n)} ${REPRICE_PROTECTION_LABEL[reason]}`
  )
  const kept = preview.protected.length
    ? `ستبقى مستحقات ${studentsCount(preview.protected.length)} دون تغيير ${byReason.size === 1 ? why[0] : `(${why.join("، ")})`}`
    : ""
  if (!preview.toUpdate.length) return `لن يتغيّر المبلغ المطلوب من أي طالب: ${kept}.`
  const n = preview.toUpdate.length
  const updated = `سيتم تحديث المبلغ المطلوب ${n === 1 ? "لطالب واحد" : n === 2 ? "لطالبين" : `لـ ${n} طلبة`}`
  return kept ? `${updated}، بينما ${kept}.` : `${updated}.`
}

/**
 * «تحديد المعلوم» / «تعديل المعلوم»: the TOTAL required from each student for
 * the year (free partial payments). Saving shows the financial impact first
 * (never-paid obligations updated, the others kept) and asks to confirm it.
 */
function GroupFeeDialog({
  open,
  onOpenChange,
  group,
  fee,
  academicYearId: presetYearId,
  freeYears,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  /** Editing the current fee (its academic year is locked) */
  fee?: GroupFee
  academicYearId?: ID
  /** Years without a current fee (setting one) */
  freeYears: AcademicYear[]
  today: ISODate
}) {
  const academicYears = useAcademicYears()
  const save = useSetGroupFee(group.id)
  const current = defaultPeriod(academicYears, today).academicYearId
  const [pickedYearId, setAcademicYearId] = useState<string>()
  const academicYearId =
    fee?.academicYearId ??
    pickedYearId ??
    presetYearId ??
    (freeYears.some((y) => y.id === current) ? current : freeYears[0]?.id)
  const yearLabel = academicYears.find((y) => y.id === academicYearId)?.label ?? ""
  const [label, setLabel] = useState(fee?.label ?? `معلوم السنة ${yearLabel}`)
  const [amount, setAmount] = useState(fee ? String(feeTotal(fee)) : "")
  const [submitted, setSubmitted] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<RepricePreviewDto | null>(null)
  const errors = {
    label: !label.trim() ? "التسمية مطلوبة" : undefined,
    amount: !(Number(amount) > 0) ? "أدخل مبلغًا أكبر من صفر" : undefined,
    year: !academicYearId ? "اختر السنة الدراسية" : undefined,
  }

  const body = (repriceObligationIds: string[]) => ({
    academicYearId: academicYearId!,
    label: label.trim(),
    amount: Number(amount),
    repriceObligationIds,
  })
  const done = () => {
    setReview(null)
    onOpenChange(false)
    toast.success(fee ? "تم تعديل المعلوم" : "تم تحديد المعلوم", {
      description: "يُضاف المعلوم تلقائيًا إلى طلبة المجموعة؛ المبالغ التي سُجّلت عليها دفعات لا تتغيّر.",
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && !checking && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setSubmitted(true)
            if (save.isPending || checking || Object.values(errors).some(Boolean)) return
            setError(null)
            setChecking(true)
            try {
              // The financial impact first: confirmed when it touches students
              const preview = await fetchRepricePreview(group.id, academicYearId!, Number(amount))
              if (preview.toUpdate.length || preview.protected.length) setReview(preview)
              else {
                await save.mutateAsync(body([]))
                done()
              }
            } catch (e) {
              setError(errorMessage(e))
            } finally {
              setChecking(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{fee ? "تعديل المعلوم" : "تحديد المعلوم"}</DialogTitle>
            <DialogDescription>{group.name} — يسري على كل أقسام المجموعة.</DialogDescription>
          </DialogHeader>
          <FormField id="fee-label" label="التسمية" required error={submitted ? errors.label : undefined}>
            <Input id="fee-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </FormField>
          <FormField
            id="fee-year"
            label="السنة الدراسية"
            required
            description={fee ? "لا يمكن تغيير السنة الدراسية عند تعديل المعلوم." : undefined}
            error={submitted ? errors.year : undefined}
          >
            {fee ? (
              <p id="fee-year" className="flex h-9 items-center rounded-lg border bg-muted/40 px-2.5 text-sm" dir="ltr">
                {yearLabel}
              </p>
            ) : (
              <AcademicYearSelect value={academicYearId ?? ""} onChange={setAcademicYearId} years={freeYears} className="sm:w-full" />
            )}
          </FormField>
          <FormField
            id="fee-amount"
            label="المبلغ المطلوب لكل طالب (د.ت)"
            required
            description="المبلغ الإجمالي للسنة الدراسية؛ يدفعه الطالب على دفعات حرّة، متى شاء."
            error={submitted ? errors.amount : undefined}
          >
            <Input id="fee-amount" type="number" min={0} step="0.5" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          {fee?.billingType === "MONTHLY" && (
            <p className="text-xs text-muted-foreground">
              المعلوم الحالي شهري ({feeDescription(fee)}): يُحفظ التعديل كمبلغ إجمالي واحد للسنة.
            </p>
          )}
          <FormErrorAlert message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending || checking} onClick={() => onOpenChange(false)}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" className="min-w-24" disabled={save.isPending || checking}>
              {(save.isPending || checking) && <Loader2 className="animate-spin" />}
              {labels.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {review && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setReview(null)}
          title="تأكيد تعديل المعلوم"
          description={repriceSentence(review)}
          confirmLabel="تأكيد وحفظ المعلوم"
          onConfirm={() => save.mutateAsync(body(review.toUpdate.map((o) => o.obligationId))).then(done)}
        >
          <div className="space-y-2 text-sm">
            <p className="rounded-lg bg-muted/50 px-3 py-2 tabular-nums">
              {review.currentFee ? (
                <>
                  المعلوم الحالي: {formatMoney(money(review.currentFee.totalAmount))} ← المعلوم الجديد:{" "}
                  <span className="font-semibold">{formatMoney(money(review.newTotalAmount))}</span>
                </>
              ) : (
                <>
                  المعلوم الجديد: <span className="font-semibold">{formatMoney(money(review.newTotalAmount))}</span>
                </>
              )}
            </p>
            <details className="rounded-lg border px-3 py-2">
              <summary className="cursor-pointer select-none text-xs font-medium">تفاصيل الطلبة</summary>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                {review.toUpdate.map((o) => (
                  <li key={o.obligationId} className="flex justify-between gap-2">
                    <span>{o.student.firstName} {o.student.lastName}</span>
                    <span className="tabular-nums">
                      {formatMoney(money(o.currentAmount))} ← {formatMoney(money(o.newAmount))}
                    </span>
                  </li>
                ))}
                {review.protected.map((o) => (
                  <li key={o.obligationId} className="flex justify-between gap-2 text-muted-foreground">
                    <span>{o.student.firstName} {o.student.lastName}</span>
                    <span>
                      يبقى {formatMoney(money(o.currentAmount))} — {o.reasons.map((r) => REPRICE_PROTECTION_LABEL[r]).join("، ")}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </ConfirmDialog>
      )}
    </Dialog>
  )
}
