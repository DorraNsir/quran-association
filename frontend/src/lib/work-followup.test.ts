import { describe, expect, it } from "vitest"

import type { WorkStatus } from "@/types/work-followup"

import { isTransferable, nextRecitation, phaseOf, progressLabel, progressOf, recitationOrdinal, WORK_STATUSES } from "./work-followup"

const TODAY = "2026-10-17"
const items = (...statuses: WorkStatus[]) => statuses.map((status) => ({ status }))

describe("«متابعة العمل» display rules", () => {
  it("only «منجز» counts as done; «ملغى» is left out of the active total", () => {
    const p = progressOf(items("COMPLETED", "PARTIAL", "POSTPONED", "NOT_EVALUATED", "CANCELLED"))
    expect(p).toEqual({ total: 5, active: 4, completed: 1, pending: 1, unfinished: 2, cancelled: 1, rate: 25 })
    expect(progressLabel(p)).toBe("1 من 4 أعمال نشطة منجزة")
    expect(progressLabel(progressOf(items("COMPLETED", "PARTIAL")))).toBe("1 من 2 أعمال منجزة")
    // No misleading percentage without active work
    const none = progressOf(items("CANCELLED"))
    expect([none.rate, progressLabel(none)]).toEqual([null, "لا توجد أعمال نشطة"])
  })

  it("transfer is offered for غير منجز / جزئي / مؤجل / ملغى only", () => {
    expect(WORK_STATUSES.filter(isTransferable)).toEqual(["NOT_COMPLETED", "PARTIAL", "POSTPONED", "CANCELLED"])
  })

  it("the proposed next recitation increments the number and keeps the Surah (no limit)", () => {
    expect(nextRecitation({ description: "العرضة الثانية من سورة التوبة", recitationNumber: 2 })).toEqual({
      number: 3,
      description: "العرضة الثالثة من سورة التوبة",
    })
    expect(nextRecitation({ description: "إكمال العرضة الثانية من سورة التوبة", recitationNumber: 2 }).description).toBe(
      "العرضة الثالثة من سورة التوبة"
    )
    expect(recitationOrdinal(12)).toBe("رقم 12")
  })

  it("session phase follows the Tunis date and time", () => {
    const s = { date: TODAY, startTime: "16:00", endTime: "18:00" }
    expect(phaseOf(s, TODAY, "15:59")).toBe("UPCOMING")
    expect(phaseOf(s, TODAY, "17:00")).toBe("ONGOING")
    expect(phaseOf(s, TODAY, "18:00")).toBe("PAST")
    expect(phaseOf({ ...s, date: "2026-10-16" }, TODAY, "08:00")).toBe("PAST")
  })
})
