import type { GroupClass, GroupFee, ID, Payment, PaymentObligation, Student } from "@/types/domain"

/**
 * Payment rules — ADMINISTRATIVE TRACKING ONLY.
 *
 * GroupFee (pricing rule of a Group) → PaymentObligation (what one student
 * is expected to pay, frozen at creation) → Payments (cash transactions).
 * Status is informational: a partial or unpaid obligation is a valid state
 * and never affects the student, their class, sessions or access.
 */

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID"

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "لم يدفع",
  PARTIAL: "دفع جزئي",
  PAID: "مدفوع بالكامل",
}

/** Total of a fee: amount × number of periods (yearly = 1 period; summer = 20 × 2 = 40). */
export function feeTotal(fee: Pick<GroupFee, "amount" | "numberOfPeriods" | "billingType">) {
  const periods = fee.billingType === "MONTHLY" ? Math.max(1, fee.numberOfPeriods ?? 1) : 1
  return fee.amount * periods
}

export function feePeriods(fee: Pick<GroupFee, "numberOfPeriods" | "billingType">) {
  return fee.billingType === "MONTHLY" ? Math.max(1, fee.numberOfPeriods ?? 1) : 1
}

const ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر"]
/** "الشهر الأول", "الشهر الثاني"… */
export const periodLabel = (n: number) => `الشهر ${ORDINALS[n - 1] ?? n}`

export function formatMoney(amount: number) {
  // Latin grouping ("6,700"): in Tunisia "6.700" reads as 6 dinars 700 millimes
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 3 })} د.ت`
}

/** The active fee of a group for a year (the fee belongs to the Group, never to one class). */
export function getGroupFee(groupId: ID, academicYearId: ID, fees: GroupFee[]) {
  return fees.find((f) => f.groupId === groupId && f.academicYearId === academicYearId && f.isActive)
}

/** Student → GroupClass → Group → GroupFee. */
export function getStudentApplicableGroupFee(
  student: Pick<Student, "groupClassId">,
  academicYearId: ID,
  groupClasses: GroupClass[],
  fees: GroupFee[]
) {
  const groupId = groupClasses.find((c) => c.id === student.groupClassId)?.groupId
  return groupId ? getGroupFee(groupId, academicYearId, fees) : undefined
}

/** A new obligation freezing today's fee total — later fee changes never rewrite it. */
export function createStudentPaymentObligation(
  studentId: ID,
  fee: GroupFee,
  createdAt: string,
  newId: () => ID
): PaymentObligation {
  return { id: newId(), studentId, groupFeeId: fee.id, academicYearId: fee.academicYearId, expectedAmount: feeTotal(fee), createdAt }
}

export function getStudentPaymentObligation(studentId: ID, academicYearId: ID, obligations: PaymentObligation[]) {
  return obligations.find((o) => o.studentId === studentId && o.academicYearId === academicYearId)
}

/** Every transaction, oldest first (history is never collapsed into one number). */
export function getPaymentsForObligation(obligationId: ID, payments: Payment[]) {
  return payments.filter((p) => p.obligationId === obligationId).sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.createdAt.localeCompare(b.createdAt))
}

export function getPaymentsForStudent(studentId: ID, payments: Payment[]) {
  return payments.filter((p) => p.studentId === studentId)
}

/** Receipt status never affects amounts: an undelivered receipt still counts as paid. */
export const getTotalPaid = (list: Pick<Payment, "amount">[]) => list.reduce((sum, p) => sum + p.amount, 0)

export const getRemainingAmount = (expected: number, paid: number) => Math.max(0, expected - paid)

export function getPaymentStatus(expected: number, paid: number): PaymentStatus {
  if (paid <= 0) return "UNPAID"
  return paid >= expected ? "PAID" : "PARTIAL"
}

export interface ObligationSummary {
  obligation: PaymentObligation
  payments: Payment[]
  expected: number
  paid: number
  remaining: number
  status: PaymentStatus
  lastPayment?: Payment
  undeliveredReceipts: number
}

export function getObligationSummary(obligation: PaymentObligation, payments: Payment[]): ObligationSummary {
  const list = getPaymentsForObligation(obligation.id, payments)
  const paid = getTotalPaid(list)
  return {
    obligation,
    payments: list,
    expected: obligation.expectedAmount,
    paid,
    remaining: getRemainingAmount(obligation.expectedAmount, paid),
    status: getPaymentStatus(obligation.expectedAmount, paid),
    lastPayment: list[list.length - 1],
    undeliveredReceipts: list.filter((p) => !p.receiptIssued).length,
  }
}

/** Payments whose receipt was not handed to the student yet. */
export const getUndeliveredReceipts = (payments: Payment[]) => payments.filter((p) => !p.receiptIssued)

/** Association totals — informational, not a collection target. */
export function getPaymentSummary(summaries: ObligationSummary[]) {
  return {
    expected: summaries.reduce((s, o) => s + o.expected, 0),
    paid: summaries.reduce((s, o) => s + o.paid, 0),
    remaining: summaries.reduce((s, o) => s + o.remaining, 0),
    notFullyPaid: summaries.filter((o) => o.status !== "PAID").length,
    undeliveredReceipts: summaries.reduce((s, o) => s + o.undeliveredReceipts, 0),
  }
}

/** Why a payment can't be recorded (no credit balances: never above what remains). */
export function paymentAmountError(amount: number, remaining: number) {
  if (!Number.isFinite(amount) || amount <= 0) return "أدخل مبلغًا أكبر من صفر"
  if (amount > remaining) return `المبلغ يتجاوز المتبقي (${formatMoney(remaining)})`
  return undefined
}
