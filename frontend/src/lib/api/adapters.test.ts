import { describe, expect, it } from "vitest"

import { toObligationRow, type ObligationDto, type PaymentDto } from "./finance"
import { toRegistrationRequest, type RegistrationRequestDto } from "./hooks/registration"
import { toResourceView, type ResourceDto } from "./resources"
import { toSessionRow, type SessionDto } from "./sessions"

const session = (over: Partial<SessionDto> = {}): SessionDto => ({
  id: "s1",
  date: "2026-10-08",
  startTime: "17:00",
  endTime: "18:00",
  status: "SCHEDULED",
  cancellationReason: null,
  weeklyScheduleId: "w1",
  groupClass: { id: "c1", status: "ACTIVE", group: { id: "g1", name: "مجموعة", status: "ACTIVE" } },
  room: { id: "r1", name: "قاعة", status: "ACTIVE", branch: { id: "b1", name: "فرع", status: "ACTIVE" } },
  teachers: [
    { id: "t1", firstName: "أ", lastName: "ب", role: "SUPERVISOR", status: "ACTIVE" },
    { id: "t2", firstName: "ج", lastName: "د", role: "ASSISTANT", status: "ACTIVE" },
  ],
  attendance: { expected: 4, recorded: 2, present: 1, absent: 0, late: 1, excused: 0 },
  ...over,
})

describe("API → screen adapters", () => {
  it("session rows: team snapshot, progress and rate from the API counts", () => {
    const row = toSessionRow(session(), "2026-10-09")
    expect(row.supervisor?.id).toBe("t1")
    expect(row.assistants.map((a) => a.id)).toEqual(["t2"])
    expect(row.progress).toEqual({ state: "PARTIAL", recorded: 2, expected: 4 })
    expect(row.summary.rate).toBe(100)
    expect(toSessionRow(session({ date: "2026-10-12", attendance: { ...session().attendance, recorded: 0 } }), "2026-10-09").progress.state).toBe("UPCOMING")
    expect(toSessionRow(session({ status: "CANCELLED" }), "2026-10-09").progress.state).toBe("CANCELLED")
  })

  it("finance: balances and status come from the API; voided payments are excluded", () => {
    const obligation = {
      id: "o1",
      student: { id: "st1", firstName: "س", lastName: "ع" },
      group: { id: "g1", name: "مجموعة" },
      academicYear: { id: "y1", label: "2026-2027" },
      fee: { id: "f1", label: "معلوم السنة", billingType: "MONTHLY", amount: "20.000", numberOfPeriods: 2, isActive: true },
      currency: "TND",
      expectedAmount: "40.000",
      totalPaid: "20.000",
      remainingAmount: "20.000",
      status: "PARTIAL",
      paymentsCount: 1,
      receiptsNotIssued: 1,
      note: null,
      createdAt: "2026-09-15T08:00:00Z",
      voided: null,
    } satisfies ObligationDto
    const payment = (id: string, voided: boolean): PaymentDto => ({
      id,
      obligationId: "o1",
      student: obligation.student,
      amount: "20.000",
      paidAt: "2026-09-20",
      method: "CASH",
      periodNumber: 1,
      note: null,
      receiptIssued: false,
      createdAt: "2026-09-20T09:00:00Z",
      voided: voided ? { at: "2026-09-21T09:00:00Z", reason: "خطأ" } : null,
    })
    const row = toObligationRow(obligation, [payment("p1", false), payment("p2", true)])
    expect(row.summary).toMatchObject({ expected: 40, paid: 20, remaining: 20, status: "PARTIAL", undeliveredReceipts: 1 })
    expect(row.summary.payments.map((p) => p.id)).toEqual(["p1"])
    expect(row.fee).toMatchObject({ billingType: "MONTHLY", amount: 20, numberOfPeriods: 2 })
  })

  it("registration requests: instants become Africa/Tunis calendar days", () => {
    const dto = {
      id: "r1",
      firstName: "س",
      lastName: "ع",
      gender: null,
      birthDate: null,
      age: 9,
      phone: "22123456",
      guardianPhone: "98765432",
      address: null,
      hasStudiedQuranBefore: false,
      previousExperience: null,
      notes: null,
      source: "PUBLIC_WEBSITE",
      status: "PENDING",
      submittedAt: "2026-10-08T23:40:00Z",
      createdBy: null,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      createdStudent: null,
      interestedGroup: { id: "g1", name: "مجموعة الأطفال" },
      interestedProgramLabel: null,
    } satisfies RegistrationRequestDto
    expect(toRegistrationRequest(dto)).toMatchObject({ submittedAt: "2026-10-09", guardianPhone: "98765432", interestedProgramLabel: "مجموعة الأطفال" })
  })

  it("resources: targets as labels, private file kept for authenticated download", () => {
    const dto = {
      id: "res1",
      title: "درس",
      description: "",
      type: "PDF",
      externalUrl: null,
      file: { id: "f1", fileName: "درس.pdf", mimeType: "application/pdf", size: 1024, url: "/api/files/f1" },
      visibility: "GROUP_CLASS",
      groups: [],
      groupClasses: [{ id: "c1", group: { id: "g1", name: "مجموعة" }, branch: { id: "b1", name: "فرع" } }],
      publishedBy: { id: "u1", firstName: "أ", lastName: "ب" },
      canManage: true,
      createdAt: "2026-10-08T10:00:00Z",
      updatedAt: "2026-10-08T10:00:00Z",
    } satisfies ResourceDto
    expect(toResourceView(dto)).toMatchObject({ targets: ["مجموعة — فرع"], publisher: "أ ب", groupClassIds: ["c1"], file: { url: "/api/files/f1" } })
  })
})

describe("room per weekly slot", () => {
  it("a weekly slot carries its own room; a class has no room of its own", async () => {
    const { toGroupClass, toSchedule } = await import("./academic")
    expect(
      toSchedule({ id: "s1", dayOfWeek: "MON", startTime: "09:00", endTime: "11:00", groupClass: { id: "c1" }, room: { id: "r2", name: "القاعة 2" } })
    ).toEqual({ id: "s1", groupClassId: "c1", day: "MON", start: "09:00", end: "11:00", roomId: "r2" })
    const cls = toGroupClass({
      id: "c1",
      status: "ACTIVE",
      group: { id: "g1", name: "م" },
      branch: { id: "b1", name: "ف" },
      rooms: [{ id: "r1", name: "القاعة 1" }, { id: "r2", name: "القاعة 2" }],
      supervisor: { id: "t1", firstName: "أ", lastName: "ب", photoUrl: null, status: "ACTIVE" },
      assistants: [],
    } as unknown as Parameters<typeof toGroupClass>[0])
    expect(cls).not.toHaveProperty("roomId")
  })
})
