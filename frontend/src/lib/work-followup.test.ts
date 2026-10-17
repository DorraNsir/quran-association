import { describe, expect, it } from "vitest"

import { buildWorkFollowupMock } from "@/lib/mock/work-followup"

import { eligibleSessions, nextRecitation, phaseOf, progressOf, recitationOrdinal } from "./work-followup"

const TODAY = "2026-10-17" // a Saturday

describe("«متابعة العمل» rules (prototype)", () => {
  it("counts only «منجز» as done; partial / postponed are not", () => {
    const items = (["COMPLETED", "PARTIAL", "POSTPONED", "NOT_EVALUATED"] as const).map((status, i) => ({
      id: String(i),
      type: "REVISION" as const,
      description: "x",
      status,
    }))
    expect(progressOf({ items })).toEqual({ total: 4, completed: 1, pending: 1, unfinished: 2 })
  })

  it("the next recitation increments the number and keeps the Surah (no limit at four)", () => {
    expect(nextRecitation({ description: "العرضة الثانية من سورة التوبة", recitationNumber: 2 })).toEqual({
      number: 3,
      description: "العرضة الثالثة من سورة التوبة",
    })
    // «إكمال» (a continuation) is not part of the next recitation
    expect(nextRecitation({ description: "إكمال العرضة الثانية من سورة التوبة", recitationNumber: 2 }).description).toBe(
      "العرضة الثالثة من سورة التوبة"
    )
    expect(nextRecitation({ description: "العرضة الرابعة من سورة يس", recitationNumber: 4 }).description).toBe("العرضة الخامسة من سورة يس")
    expect(recitationOrdinal(12)).toBe("رقم 12")
  })

  it("session phase follows the Tunis date and time", () => {
    const s = { date: TODAY, start: "16:00", end: "18:00" }
    expect(phaseOf(s, TODAY, "15:59")).toBe("UPCOMING")
    expect(phaseOf(s, TODAY, "17:00")).toBe("ONGOING")
    expect(phaseOf(s, TODAY, "18:00")).toBe("PAST")
    expect(phaseOf({ ...s, date: "2026-10-16" }, TODAY, "08:00")).toBe("PAST")
  })

  it("new work targets only existing upcoming, non-cancelled sessions of the student's class", () => {
    const data = buildWorkFollowupMock(TODAY)
    const options = eligibleSessions(data, "wf-s4", TODAY, "08:00")
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((s) => s.groupClassId === "wf-c2" && s.status === "SCHEDULED" && s.date >= TODAY)).toBe(true)
    // The mock's cancelled upcoming session is never offered
    const cancelled = data.sessions.find((s) => s.status === "CANCELLED")!
    expect(options.some((s) => s.id === cancelled.id)).toBe(false)
  })

  it("the mock covers the four types, the five results, a carried item and numbered recitations", () => {
    const data = buildWorkFollowupMock(TODAY)
    const items = data.programs.flatMap((p) => p.items)
    expect(new Set(items.map((i) => i.type))).toEqual(new Set(["MEMORIZATION", "REVISION", "RECITATION", "EXAM"]))
    expect(new Set(items.map((i) => i.status))).toEqual(new Set(["NOT_EVALUATED", "COMPLETED", "NOT_COMPLETED", "PARTIAL", "POSTPONED"]))
    expect(items.some((i) => i.carriedFromItemId)).toBe(true)
    const yassine = items.filter((i) => i.type === "RECITATION" && i.description.includes("يس")).map((i) => i.recitationNumber)
    expect(yassine).toEqual([1, 2, 3])
    // Every program points to a real session; one program per student per session
    const ids = new Set(data.sessions.map((s) => s.id))
    expect(data.programs.every((p) => ids.has(p.sessionId))).toBe(true)
    const keys = data.programs.map((p) => `${p.studentId}|${p.sessionId}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
