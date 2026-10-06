import { createStudentPaymentObligation, getStudentApplicableGroupFee } from "@/lib/payments"
import type { GroupFee, Payment, PaymentObligation, RegistrationRequest } from "@/types/domain"

import { academicYears } from "./academic-years"
import { groupClasses, groups } from "./groups"
import { MOCK_TODAY } from "./reference-date"
import { students } from "./students"

const [PREVIOUS, CURRENT] = academicYears

/* ---------------- Registration requests ---------------- */

export const registrationRequests: RegistrationRequest[] = [
  {
    id: "rr1",
    firstName: "إسلام",
    lastName: "الجبالي",
    age: 9,
    phone: "55210348",
    hasStudiedQuranBefore: true,
    previousExperience: "حفظ جزء عمّ في الكتّاب",
    notes: "يفضّل حصص السبت صباحًا.",
    source: "PUBLIC_WEBSITE",
    status: "PENDING",
    submittedAt: "2026-09-30",
  },
  {
    id: "rr2",
    firstName: "هبة",
    lastName: "المرزوقي",
    birthDate: "2014-03-02",
    phone: "97433120",
    hasStudiedQuranBefore: false,
    notes: "حضرت الأم إلى المقر للاستفسار.",
    source: "ADMIN",
    status: "PENDING",
    submittedAt: "2026-10-01",
  },
  {
    id: "rr3",
    firstName: "كريم",
    lastName: "الزغلامي",
    age: 4,
    phone: "23987114",
    hasStudiedQuranBefore: false,
    notes: "السن أقل من الحد الأدنى للمجموعات الحالية.",
    source: "PUBLIC_WEBSITE",
    status: "REFUSED",
    submittedAt: "2026-09-15",
    reviewedAt: "2026-09-18",
    reviewedByUserId: "u1",
  },
  {
    id: "rr4",
    firstName: "مريم",
    lastName: "بوزيد",
    birthDate: "2017-02-18",
    phone: "26112093",
    hasStudiedQuranBefore: true,
    previousExperience: "تحفظ قصار السور",
    source: "PUBLIC_WEBSITE",
    status: "ACCEPTED",
    submittedAt: "2026-09-05",
    reviewedAt: "2026-09-10",
    reviewedByUserId: "u1",
    createdStudentId: "s53",
  },
]

/* ---------------- Group fees ---------------- */

/** Yearly fee per group (DT). The fee belongs to the Group: every class inherits it. */
const YEARLY: Record<string, number> = { g1: 150, g2: 100, g3: 150, g4: 100, g5: 120, g6: 100, g7: 120, g8: 150, g9: 120, g11: 120 }

export const groupFees: GroupFee[] = [
  ...groups
    .filter((g) => YEARLY[g.id] !== undefined)
    .map((g): GroupFee => ({
      id: `fee-${g.id}-${CURRENT.id}`,
      groupId: g.id,
      academicYearId: CURRENT.id,
      label: `معلوم السنة ${CURRENT.label}`,
      billingType: "YEARLY",
      amount: YEARLY[g.id],
      numberOfPeriods: 1,
      isActive: true,
      createdAt: CURRENT.startDate,
      updatedAt: CURRENT.startDate,
    })),
  // Summer program: 20 DT per month × 2 months = 40 DT — driven by the fee, not by the group's name
  {
    id: `fee-g12-${CURRENT.id}`,
    groupId: "g12",
    academicYearId: CURRENT.id,
    label: "البرنامج الصيفي 2027",
    billingType: "MONTHLY",
    amount: 20,
    numberOfPeriods: 2,
    startDate: "2027-07-01",
    endDate: "2027-08-31",
    isActive: true,
    createdAt: "2026-09-28",
    updatedAt: "2026-09-28",
  },
  // Last year's fee stays as history (and its obligations keep their own amounts)
  {
    id: `fee-g1-${PREVIOUS.id}`,
    groupId: "g1",
    academicYearId: PREVIOUS.id,
    label: `معلوم السنة ${PREVIOUS.label}`,
    billingType: "YEARLY",
    amount: 130,
    numberOfPeriods: 1,
    isActive: true,
    createdAt: PREVIOUS.startDate,
    updatedAt: PREVIOUS.startDate,
  },
]

/* ---------------- Obligations & payments ---------------- */

let obligationSeq = 0
let paymentSeq = 0
const nextObligationId = () => `po${++obligationSeq}`
const nextPaymentId = () => `pay${++paymentSeq}`

export const paymentObligations: PaymentObligation[] = []
export const payments: Payment[] = []

/** Deterministic 0–3 pattern per student: none, two installments, partial, full. */
const patternOf = (id: string) => [...id].reduce((h, c) => h + c.charCodeAt(0), 0) % 4

function addPayment(obligation: PaymentObligation, amount: number, paidAt: string, receiptIssued: boolean, periodNumber?: number) {
  payments.push({
    id: nextPaymentId(),
    obligationId: obligation.id,
    studentId: obligation.studentId,
    amount,
    paidAt,
    method: "CASH",
    receiptIssued,
    periodNumber,
    recordedByUserId: "u1",
    createdAt: paidAt,
  })
}

for (const student of students.filter((s) => s.status !== "ARCHIVED")) {
  for (const year of [PREVIOUS, CURRENT]) {
    // Last year: only students who were already registered then
    if (year === PREVIOUS && student.registrationDate > PREVIOUS.endDate) continue
    const fee = getStudentApplicableGroupFee(student, year.id, groupClasses, groupFees)
    if (!fee) continue
    const createdAt = student.registrationDate > year.startDate ? student.registrationDate : year.startDate
    const obligation = createStudentPaymentObligation(student.id, fee, createdAt, nextObligationId)
    paymentObligations.push(obligation)

    const groupId = groupClasses.find((c) => c.id === student.groupClassId)?.groupId
    // مجموعة ماهر and the summer program start with no payment (used to try the module)
    if (groupId === "g11" || groupId === "g12") continue
    const total = obligation.expectedAmount
    if (year === PREVIOUS) {
      addPayment(obligation, total, "2025-10-04", true)
      continue
    }
    const day = (n: number) => `2026-09-${String(Math.min(30, 16 + n)).padStart(2, "0")}`
    switch (patternOf(student.id)) {
      case 1:
        addPayment(obligation, total / 2, day(0), true)
        if (day(10) <= MOCK_TODAY) addPayment(obligation, total / 2, day(10), false)
        break
      case 2:
        addPayment(obligation, 50, day(4), patternOf(student.id + "r") !== 0)
        break
      case 3:
        addPayment(obligation, total, day(2), true)
        break
      default:
        break // nothing paid yet — a valid state
    }
  }
}
