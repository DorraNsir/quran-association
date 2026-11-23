import { describe, expect, it } from "vitest"

import type { WorkProgram, WorkStatus } from "@/types/work-followup"

import {
  carriedFromLabel,
  evaluationBlockMessage,
  evaluationBlockOf,
  isTransferable,
  nextRecitation,
  phaseOf,
  progressLabel,
  progressOf,
  recitationOrdinal,
  WORK_STATUSES,
  recitationState,
  RECITATION_STATE_SHORT,
  RECITATION_STATES,
} from "./work-followup"

const TODAY = "2026-10-17"
const items = (...statuses: WorkStatus[]) => statuses.map((status) => ({ status }))

describe("«متابعة العمل» display rules", () => {
  it("only «منجز» counts as done; «ملغى» is left out of the active total", () => {
    const p = progressOf(items("COMPLETED", "PARTIAL", "POSTPONED", "NOT_EVALUATED", "CANCELLED"))
    expect(p).toEqual({ total: 5, active: 4, completed: 1, pending: 1, unfinished: 2, cancelled: 1, rate: 25 })
    expect(progressLabel(p)).toBe("تم إنجاز 1 من أصل 4 أعمال نشطة")
    expect(progressLabel(progressOf(items("COMPLETED", "PARTIAL")))).toBe("تم إنجاز 1 من أصل 2 أعمال")
    // Nothing done yet / everything done / no work at all
    expect(progressLabel(progressOf(items("PARTIAL", "NOT_EVALUATED")))).toBe("2 أعمال بانتظار الإنجاز")
    expect(progressLabel(progressOf(items("COMPLETED", "COMPLETED", "CANCELLED")))).toBe("تم إنجاز 2 من أصل 3 أعمال")
    expect(progressLabel(progressOf(items("COMPLETED", "COMPLETED")))).toBe("تم إنجاز جميع الأعمال (2/2)")
    expect(progressLabel(progressOf([]))).toBe("لا توجد أعمال")
    // No misleading percentage without active work
    const none = progressOf(items("CANCELLED"))
    expect([none.rate, progressLabel(none)]).toEqual([null, "لا توجد أعمال نشطة"])
  })

  it("transfer is offered for غير منجز / جزئي / مؤجل / ملغى only", () => {
    expect(WORK_STATUSES.filter((s) => isTransferable(s))).toEqual(["NOT_COMPLETED", "PARTIAL", "POSTPONED", "CANCELLED"])
    expect(WORK_STATUSES.filter((s) => isTransferable(s, "SCHEDULED"))).toEqual(["NOT_COMPLETED", "PARTIAL", "POSTPONED", "CANCELLED"])
    expect(WORK_STATUSES.filter((s) => isTransferable(s, "COMPLETED"))).not.toContain("NOT_EVALUATED")
  })

  it("a cancelled session: its unevaluated work may be carried too (never evaluated)", () => {
    expect(isTransferable("NOT_EVALUATED", "CANCELLED")).toBe(true)
    expect(isTransferable("COMPLETED", "CANCELLED")).toBe(false)
  })

  describe("evaluation follows the session (server verdict + Africa/Tunis clock)", () => {
    // 2026-11-18 15:00 in Tunis (UTC+1)
    const at = new Date("2026-11-18T14:00:00Z")
    const of = (status: "SCHEDULED" | "COMPLETED" | "CANCELLED", date: string, startTime: string, blockedReason: WorkProgram["evaluation"]["blockedReason"]) => ({
      session: { id: "s", date, startTime, endTime: "23:00", status, groupClassId: "c", groupName: "g", branchName: "b" },
      evaluation: { allowed: blockedReason === null, blockedReason },
    })

    it("before the start: closed; the message says why", () => {
      expect(evaluationBlockOf(of("SCHEDULED", "2026-11-18", "16:00", "SESSION_NOT_STARTED"), at)).toBe("NOT_STARTED")
      expect(evaluationBlockOf(of("SCHEDULED", "2026-11-19", "08:00", "SESSION_NOT_STARTED"), at)).toBe("NOT_STARTED")
      expect(evaluationBlockMessage.NOT_STARTED).toBe("لا يمكن تقييم برنامج العمل قبل بداية الحصة")
    })

    it("ongoing and completed: open", () => {
      expect(evaluationBlockOf(of("SCHEDULED", "2026-11-18", "14:30", null), at)).toBeNull()
      expect(evaluationBlockOf(of("COMPLETED", "2026-11-10", "16:00", null), at)).toBeNull()
    })

    it("the start minute came while the page stayed open: the clock opens what the server said «not yet»", () => {
      expect(evaluationBlockOf(of("SCHEDULED", "2026-11-18", "15:00", "SESSION_NOT_STARTED"), at)).toBeNull()
    })

    it("the server decides: a device clock behind never closes an open session, a cancelled one is never opened", () => {
      // The device thinks 15:00, the server says the 16:00 lesson started
      expect(evaluationBlockOf(of("SCHEDULED", "2026-11-18", "16:00", null), at)).toBeNull()
      expect(evaluationBlockOf(of("CANCELLED", "2026-11-10", "16:00", "SESSION_CANCELLED"), at)).toBe("CANCELLED")
      expect(evaluationBlockMessage.CANCELLED).toBe("لا يمكن تقييم برنامج العمل لحصة ملغاة")
    })
  })

  it("«منقول من …»: the result when carried; from a cancelled session, unevaluated", () => {
    expect(carriedFromLabel({ sessionDate: "2026-11-10", status: "POSTPONED" })).toMatch(/^منقول من حصة سابقة: .* — مؤجل$/)
    expect(carriedFromLabel({ sessionDate: "2026-11-10", status: "NOT_EVALUATED" })).toMatch(/^منقول من حصة ملغاة: /)
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

describe("recitationState («متابعة العرضات»: مجدولة vs بانتظار التقييم)", () => {
  const at = new Date("2026-11-23T14:00:00Z") // 15:00 in Tunis
  it("a session not started: «مجدولة»; started or past: «بانتظار التقييم»", () => {
    expect(recitationState("PENDING", "2026-11-24", undefined, at)).toBe("SCHEDULED")
    expect(recitationState("PENDING", "2026-11-23", "16:00", at)).toBe("SCHEDULED")
    expect(recitationState("PENDING", "2026-11-23", "15:00", at)).toBe("PENDING") // the start minute
    expect(recitationState("PENDING", "2026-11-23", "08:00", at)).toBe("PENDING")
    expect(recitationState("PENDING", "2026-11-20", "23:00", at)).toBe("PENDING")
    // today, start time unknown: as before (the server decides the evaluation)
    expect(recitationState("PENDING", "2026-11-23", undefined, at)).toBe("PENDING")
  })
  it("results and a cancelled session are kept as they are, even in the future", () => {
    for (const e of ["COMPLETED", "PARTIAL", "NOT_COMPLETED", "CANCELLED", "POSTPONED", "SESSION_CANCELLED"] as const)
      expect(recitationState(e, "2099-01-01", "08:00", at)).toBe(e)
    expect(RECITATION_STATE_SHORT.SCHEDULED).toBe("مجدولة")
    expect(RECITATION_STATE_SHORT.PENDING).toBe("بانتظار التقييم")
    expect(RECITATION_STATES.slice(-3)).toEqual(["POSTPONED", "PENDING", "SCHEDULED"])
  })
})
