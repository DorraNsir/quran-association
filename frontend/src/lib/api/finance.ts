"use client"

import { useQuery } from "@tanstack/react-query"

import { tunisDateOf } from "@/lib/dates"
import type { ObligationSummary, PaymentStatus } from "@/lib/payments"
import type { BillingType, GroupFee, ID, ISODate, Payment } from "@/types/domain"

import { api, useApiMutation } from "./academic"
import type { Page, Query } from "./client"

/* ------------------------------ API DTOs ------------------------------ */
/* Money is a decimal string (TND); statuses and balances are computed by the API. */

interface Ref {
  id: string
  name: string
}
interface YearRef {
  id: string
  label: string
}
export interface GroupFeeDto {
  id: string
  group: Ref
  academicYear: YearRef
  label: string
  billingType: BillingType
  amount: string
  numberOfPeriods: number
  totalAmount: string
  currency: string
  startDate: string | null
  endDate: string | null
  isActive: boolean
  /** REPLACED: a newer version took over («استُبدل»); STOPPED: «إيقاف» without replacement («موقوف») */
  status?: "ACTIVE" | "REPLACED" | "STOPPED"
  createdAt: string
  deactivatedAt?: string | null
  obligationsCount: number
}
export interface ObligationDto {
  id: string
  student: { id: string; firstName: string; lastName: string }
  group: Ref
  academicYear: YearRef
  fee: { id: string; label: string; billingType: BillingType; amount: string; numberOfPeriods: number; isActive: boolean }
  currency: string
  /** Frozen when charged */
  expectedAmount: string
  /** Still required (a transfer to another group releases it); older APIs: expectedAmount */
  requiredAmount?: string
  /** CASH: live payments only */
  totalPaid: string
  /** Credit carried from / to another group (never cash) */
  creditIn?: string
  creditOut?: string
  remainingAmount: string
  /** Settled beyond what is required: «رصيد زائد» */
  excessAmount?: string
  status: PaymentStatus
  paymentsCount: number
  receiptsNotIssued: number
  note: string | null
  createdAt: string
  voided: { at: string; reason: string } | null
  /** Closed by a transfer to another group */
  closed?: { at: string; toGroup: Ref; creditAmount: string; excessAmount: string } | null
  creditsReceived?: { fromGroup: Ref; amount: string; at: string }[]
}
export interface PaymentDto {
  id: string
  obligationId: string
  student: { id: string; firstName: string; lastName: string }
  amount: string
  paidAt: ISODate
  method: "CASH"
  periodNumber: number | null
  note: string | null
  receiptIssued: boolean
  createdAt: string
  voided: { at: string; reason: string } | null
}
export interface FinanceTotals {
  /** Σ required */
  expectedAmount: string
  /** Σ CASH payments */
  totalPaid: string
  /** Net credit carried into these obligations from other groups (0 association-wide) */
  creditAmount?: string
  remainingAmount: string
  /** Σ «رصيد زائد» */
  excessAmount?: string
}
export interface FinanceSummaryDto {
  obligationsCount: number
  totals: FinanceTotals
  statusCounts: Record<PaymentStatus, number>
  collected: { paymentsCount: number; amount: string; receiptsNotIssued: number; voidedPaymentsCount: number }
}
interface StudentFinanceSummaryDto {
  obligations: ObligationDto[]
  totals: FinanceTotals
}

/* ------------------------------ adapters ------------------------------ */

export const money = (value: string) => Number(value)

export const toGroupFee = (f: GroupFeeDto): GroupFee => ({
  id: f.id,
  groupId: f.group.id,
  academicYearId: f.academicYear.id,
  label: f.label,
  billingType: f.billingType,
  amount: money(f.amount),
  numberOfPeriods: f.numberOfPeriods,
  startDate: f.startDate ?? undefined,
  endDate: f.endDate ?? undefined,
  isActive: f.isActive,
  status: f.status ?? (f.isActive ? "ACTIVE" : "REPLACED"),
  deactivatedAt: f.deactivatedAt ? tunisDateOf(f.deactivatedAt) : undefined,
  createdAt: tunisDateOf(f.createdAt),
  updatedAt: tunisDateOf(f.createdAt),
})

const feeOf = (o: ObligationDto): GroupFee => ({
  id: o.fee.id,
  groupId: o.group.id,
  academicYearId: o.academicYear.id,
  label: o.fee.label,
  billingType: o.fee.billingType,
  amount: money(o.fee.amount),
  numberOfPeriods: o.fee.numberOfPeriods,
  isActive: o.fee.isActive,
  createdAt: "",
  updatedAt: "",
})

export const toPayment = (p: PaymentDto): Payment => ({
  id: p.id,
  obligationId: p.obligationId,
  studentId: p.student.id,
  amount: money(p.amount),
  paidAt: p.paidAt,
  method: p.method,
  receiptIssued: p.receiptIssued,
  periodNumber: p.periodNumber ?? undefined,
  note: p.note ?? undefined,
  recordedByUserId: "",
  createdAt: tunisDateOf(p.createdAt),
})

/** An obligation with the API's balances; `payments` are those of the obligation when loaded (live ones only). */
export interface ObligationRow {
  summary: ObligationSummary
  fee: GroupFee
  dto: ObligationDto
}

export function toObligationRow(o: ObligationDto, payments: PaymentDto[] = []): ObligationRow {
  const live = payments.filter((p) => !p.voided && p.obligationId === o.id).map(toPayment)
  return {
    dto: o,
    fee: feeOf(o),
    summary: {
      obligation: {
        id: o.id,
        studentId: o.student.id,
        groupFeeId: o.fee.id,
        academicYearId: o.academicYear.id,
        expectedAmount: money(o.expectedAmount),
        createdAt: tunisDateOf(o.createdAt),
      },
      payments: live,
      expected: money(o.requiredAmount ?? o.expectedAmount),
      paid: money(o.totalPaid),
      creditIn: money(o.creditIn ?? "0"),
      creditOut: money(o.creditOut ?? "0"),
      excess: money(o.excessAmount ?? "0"),
      remaining: money(o.remainingAmount),
      status: o.status,
      lastPayment: live[live.length - 1],
      undeliveredReceipts: o.receiptsNotIssued,
      closedToGroup: o.closed?.toGroup.name,
      creditsFrom: (o.creditsReceived ?? []).map((c) => ({ groupName: c.fromGroup.name, amount: money(c.amount) })),
    },
  }
}

/* ------------------------------ queries ------------------------------ */

export const financeKey = ["finance"] as const
const clean = (q: object): Query => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== "")) as Query

export interface ObligationFilters {
  academicYearId?: string
  groupId?: string
  status?: PaymentStatus
  search?: string
}

/** Admin: obligations of a year (server filters and pagination; voided ones excluded). */
export function useObligations(filters: ObligationFilters, page: number, pageSize: number, enabled = true) {
  return useQuery({
    queryKey: [...financeKey, "obligations", clean(filters), page, pageSize],
    queryFn: ({ signal }) => api<Page<ObligationDto>>("/admin/payment-obligations", { query: { ...clean(filters), page, pageSize }, signal }),
    placeholderData: (previous) => previous,
    enabled,
  })
}

/** Admin: association totals for the same filters (informational). */
export function useFinanceSummary(filters: { academicYearId?: string; groupId?: string }, enabled = true) {
  return useQuery({
    queryKey: [...financeKey, "summary", clean(filters)],
    queryFn: ({ signal }) => api<FinanceSummaryDto>("/admin/finance/summary", { query: clean(filters), signal }),
    enabled,
  })
}

export function useObligationPayments(obligationId: string | undefined) {
  return useQuery({
    queryKey: [...financeKey, "obligation-payments", obligationId],
    queryFn: ({ signal }) => api<PaymentDto[]>(`/admin/payment-obligations/${obligationId}/payments`, { signal }),
    enabled: Boolean(obligationId),
  })
}

/** One student's obligations (live ones) and payments: admin endpoints, or the student's own. */
export function useStudentFinance(scope: "admin" | "student", studentId?: ID) {
  const obligations = useQuery({
    queryKey: [...financeKey, scope, "student-obligations", studentId],
    queryFn: async ({ signal }) =>
      scope === "admin"
        ? api<ObligationDto[]>(`/admin/students/${studentId}/payment-obligations`, { signal })
        : (await api<StudentFinanceSummaryDto>("/student/finance/summary", { signal })).obligations,
  })
  const payments = useQuery({
    queryKey: [...financeKey, scope, "student-payments", studentId],
    queryFn: ({ signal }) =>
      api<PaymentDto[]>(scope === "admin" ? `/admin/students/${studentId}/payments` : "/student/payments", { signal }),
  })
  const rows = obligations.data
    ? obligations.data.filter((o) => !o.voided).map((o) => toObligationRow(o, payments.data ?? []))
    : undefined
  return { rows, queries: [obligations, payments] }
}

/** The fee a class inherits from its group for the current year (to create a missing obligation). */
export function useApplicableFee(groupClassId?: ID) {
  return useQuery({
    queryKey: [...financeKey, "applicable-fee", groupClassId],
    queryFn: ({ signal }) => api<{ fee: GroupFeeDto | null }>(`/admin/group-classes/${groupClassId}/fee`, { signal }),
    enabled: Boolean(groupClassId),
  })
}

export function useGroupFees(groupId: ID) {
  return useQuery({
    queryKey: [...financeKey, "group-fees", groupId],
    queryFn: async ({ signal }) => {
      const result = await api<{ data: GroupFeeDto[] } | GroupFeeDto[]>(`/admin/groups/${groupId}/fees`, { signal })
      return (Array.isArray(result) ? result : result.data).map(toGroupFee)
    },
  })
}

/* ------------------------------ mutations ------------------------------ */

export function useCreateObligation() {
  return useApiMutation(
    (body: { studentId: ID; groupFeeId: ID }) => api<ObligationDto>("/admin/payment-obligations", { method: "POST", body }),
    [financeKey]
  )
}

export function useRecordPayment() {
  return useApiMutation(
    (body: { obligationId: ID; amount: number; paidAt: ISODate; periodNumber?: number; note?: string; receiptIssued: boolean }) =>
      api<PaymentDto>("/admin/payments", {
        method: "POST",
        body: { ...body, amount: body.amount.toFixed(3).replace(/\.?0+$/, ""), note: body.note?.trim() || null },
      }),
    [financeKey]
  )
}

export function useSetReceipt() {
  return useApiMutation(
    ({ paymentId, receiptIssued }: { paymentId: ID; receiptIssued: boolean }) =>
      api<PaymentDto>(`/admin/payments/${paymentId}/receipt`, { method: "PATCH", body: { receiptIssued } }),
    [financeKey]
  )
}

const moneyText = (amount: number) => amount.toFixed(3).replace(/\.?0+$/, "")

/** «تعديل المعلوم» preview: the obligations a new total would update, and the protected ones */
export interface RepricePreviewDto {
  currentFee: GroupFeeDto | null
  newTotalAmount: string
  toUpdate: { obligationId: string; student: { id: string; firstName: string; lastName: string }; currentAmount: string; newAmount: string }[]
  protected: {
    obligationId: string
    student: { id: string; firstName: string; lastName: string }
    currentAmount: string
    reasons: RepriceProtection[]
  }[]
  unchangedCount: number
}
export type RepriceProtection = "HAS_PAYMENTS" | "HAS_VOIDED_PAYMENTS" | "HAS_TRANSFER_CREDIT" | "STUDENT_INACTIVE" | "LEFT_GROUP"

export const fetchRepricePreview = (groupId: ID, academicYearId: ID, amount: number) =>
  api<RepricePreviewDto>(`/admin/groups/${groupId}/fees/reprice-preview`, { query: { academicYearId, amount: moneyText(amount) } })

/**
 * Sets THE fee of a group for a year: the TOTAL required from each student
 * (yearly). A new version; the obligations of the preview the administrator
 * confirmed (never paid) are updated, the others keep their amount.
 */
export function useSetGroupFee(groupId: ID) {
  return useApiMutation(
    (body: { academicYearId: ID; label: string; amount: number; repriceObligationIds: string[] }) =>
      api<GroupFeeDto>(`/admin/groups/${groupId}/fees`, {
        method: "PUT",
        body: { ...body, amount: moneyText(body.amount) },
      }),
    [financeKey]
  )
}

/* ------------------------- transfers between groups ------------------------- */

/** «نقل مالي» preview of a move to another class (GET …/group-class/preview) */
export interface TransferPlanDto {
  sameGroup: boolean
  targetGroup: Ref
  transfers: {
    academicYear: YearRef
    from: { obligationId: string; group: Ref; requiredAmount: string; cashPaid: string; creditIn: string; settledAmount: string }
    to: { group: Ref; feeId: string | null; requiredAmount: string | null }
    creditAmount: string
    excessAmount: string
    remainingAfter: string | null
    blocked: "NO_TARGET_FEE" | null
  }[]
}
export interface FinancialTransferConfirm {
  fromObligationId: string
  creditAmount: string
}

export function useTransferPreview(studentId: ID, groupClassId: ID) {
  return useQuery({
    queryKey: [...financeKey, "transfer-preview", studentId, groupClassId],
    queryFn: ({ signal }) =>
      api<TransferPlanDto>(`/admin/students/${studentId}/group-class/preview`, { query: { groupClassId }, signal }),
    enabled: Boolean(studentId && groupClassId),
    staleTime: 0,
  })
}

export const transferConfirmation = (plan: TransferPlanDto): FinancialTransferConfirm[] =>
  plan.transfers.map((t) => ({ fromObligationId: t.from.obligationId, creditAmount: t.creditAmount }))

export function useDeactivateGroupFee() {
  return useApiMutation((id: ID) => api<GroupFeeDto>(`/admin/group-fees/${id}/deactivate`, { method: "POST" }), [financeKey])
}
