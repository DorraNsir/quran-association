import { describe, expect, it } from "vitest"

import {
  attendanceOpen,
  attendanceOpensLabel,
  canAdminCancel,
  canDeleteExtra,
  canEditExtra,
  canTeacherCancel,
  notStartedInTunis,
} from "./session-actions"

// 2026-11-14 15:30 in Africa/Tunis (UTC+1)
const AT = new Date("2026-11-14T14:30:00Z")
const lesson = (over: Partial<{ extra: boolean; status: "SCHEDULED" | "COMPLETED" | "CANCELLED"; date: string; start: string }> = {}) => ({
  extra: true,
  status: "SCHEDULED" as const,
  date: "2026-11-20",
  start: "10:00",
  ...over,
})

describe("session actions offered (the API decides)", () => {
  it("not started yet: a later day, or later today in Africa/Tunis", () => {
    expect(notStartedInTunis("2026-11-15", "00:00", AT)).toBe(true)
    expect(notStartedInTunis("2026-11-14", "15:31", AT)).toBe(true)
    expect(notStartedInTunis("2026-11-14", "15:30", AT)).toBe(false)
    expect(notStartedInTunis("2026-11-14", "09:00", AT)).toBe(false)
    expect(notStartedInTunis("2026-11-13", "23:59", AT)).toBe(false)
  })

  it("teacher cancel: the supervisor, an upcoming scheduled lesson, no attendance", () => {
    expect(canTeacherCancel(lesson({ extra: false }), 0, true, AT)).toBe(true)
    expect(canTeacherCancel(lesson(), 0, false, AT)).toBe(false) // an assistant
    expect(canTeacherCancel(lesson(), 1, true, AT)).toBe(false) // attendance recorded
    expect(canTeacherCancel(lesson({ date: "2026-11-14", start: "09:00" }), 0, true, AT)).toBe(false) // started
    expect(canTeacherCancel(lesson({ status: "COMPLETED" }), 0, true, AT)).toBe(false)
    expect(canTeacherCancel(lesson({ status: "CANCELLED" }), 0, true, AT)).toBe(false)
  })

  it("admin cancel: a scheduled lesson without attendance (never a completed one)", () => {
    expect(canAdminCancel(lesson({ date: "2026-11-01" }), 0)).toBe(true)
    expect(canAdminCancel(lesson({ status: "COMPLETED" }), 0)).toBe(false)
    expect(canAdminCancel(lesson(), 2)).toBe(false)
  })

  it("edit: an extra lesson, scheduled, not started, without attendance", () => {
    expect(canEditExtra(lesson(), 0, AT)).toBe(true)
    expect(canEditExtra(lesson({ extra: false }), 0, AT)).toBe(false)
    expect(canEditExtra(lesson({ status: "CANCELLED" }), 0, AT)).toBe(false)
    expect(canEditExtra(lesson({ date: "2026-11-14", start: "08:00" }), 0, AT)).toBe(false)
    expect(canEditExtra(lesson(), 1, AT)).toBe(false)
  })

  it("permanent delete: an extra lesson without attendance, cancelled (any date) or not started", () => {
    expect(canDeleteExtra(lesson(), 0, AT)).toBe(true)
    expect(canDeleteExtra(lesson({ status: "CANCELLED", date: "2026-10-01" }), 0, AT)).toBe(true)
    expect(canDeleteExtra(lesson({ extra: false }), 0, AT)).toBe(false) // a regular lesson
    expect(canDeleteExtra(lesson({ status: "COMPLETED" }), 0, AT)).toBe(false)
    expect(canDeleteExtra(lesson({ date: "2026-11-10" }), 0, AT)).toBe(false) // past scheduled
    expect(canDeleteExtra(lesson(), 1, AT)).toBe(false)
  })
})

describe("attendance opens at the lesson's start (Africa/Tunis)", () => {
  const s = (date: string, start: string, status: "SCHEDULED" | "COMPLETED" | "CANCELLED" = "SCHEDULED") => ({ status, date, start })
  const tunis = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`)

  it("before the start: closed; the start minute itself and after it (also after the end): open", () => {
    expect(attendanceOpen(s("2026-11-14", "22:30"), tunis("2026-11-14", "21:35"))).toBe(false)
    expect(attendanceOpen(s("2026-11-14", "22:30"), tunis("2026-11-14", "22:29"))).toBe(false)
    expect(attendanceOpen(s("2026-11-14", "22:30"), tunis("2026-11-14", "22:30"))).toBe(true)
    expect(attendanceOpen(s("2026-11-14", "22:30"), tunis("2026-11-14", "22:45"))).toBe(true)
    expect(attendanceOpen(s("2026-11-14", "22:30"), tunis("2026-11-15", "09:00"))).toBe(true)
    expect(attendanceOpen(s("2026-11-14", "22:30", "COMPLETED"), tunis("2026-11-15", "09:00"))).toBe(true)
  })

  it("a cancelled lesson never opens", () => {
    expect(attendanceOpen(s("2026-11-14", "10:00", "CANCELLED"), tunis("2026-11-14", "12:00"))).toBe(false)
  })

  it("late night and midnight: 23:59 the day before is earlier than 00:10", () => {
    expect(attendanceOpen(s("2026-11-15", "00:10"), tunis("2026-11-14", "23:59"))).toBe(false)
    expect(attendanceOpen(s("2026-11-15", "00:10"), tunis("2026-11-15", "00:10"))).toBe(true)
    expect(attendanceOpen(s("2026-11-14", "23:45"), tunis("2026-11-14", "23:50"))).toBe(true)
  })

  it("Tunis time, not UTC nor the browser's zone: 23:20 UTC is 00:20 the next day", () => {
    expect(attendanceOpen(s("2026-11-15", "00:15"), new Date("2026-11-14T23:10:00Z"))).toBe(false)
    expect(attendanceOpen(s("2026-11-15", "00:15"), new Date("2026-11-14T23:20:00Z"))).toBe(true)
  })

  it("the waiting message names the start (and the day when it is not today)", () => {
    const day = (d: string) => `«${d}»`
    expect(attendanceOpensLabel(s("2026-11-14", "22:30"), day, tunis("2026-11-14", "21:35"))).toBe("يبدأ تسجيل الحضور عند الساعة 22:30")
    expect(attendanceOpensLabel(s("2026-11-16", "17:00"), day, tunis("2026-11-14", "21:35"))).toBe(
      "يبدأ تسجيل الحضور يوم «2026-11-16» عند الساعة 17:00"
    )
  })
})
