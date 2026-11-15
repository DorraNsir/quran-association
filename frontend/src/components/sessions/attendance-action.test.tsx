import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SessionRow } from "./use-session-rows"
import { AttendanceAction } from "./attendance-action"

const tunis = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`)
const row = (over: Partial<SessionRow["session"]> = {}, state: SessionRow["progress"]["state"] = "NOT_RECORDED") =>
  ({
    session: { id: "se1", groupClassId: "c1", scheduleId: "", roomId: "r1", date: "2026-11-14", start: "22:30", end: "23:30", status: "SCHEDULED", ...over },
    progress: { state, recorded: 0, expected: 3 },
  }) as unknown as SessionRow

beforeEach(() => {
  // Only the clock and the timers are faked (the action re-checks the clock)
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] })
})
afterEach(() => vi.useRealTimers())

describe("«تسجيل الحضور» action timing", () => {
  it("before the start: disabled, saying when it opens; it turns on by itself at the start minute", () => {
    vi.setSystemTime(tunis("2026-11-14", "22:29"))
    render(<AttendanceAction row={row()} workspace="teacher" />)
    const waiting = screen.getByRole("button", { name: "تسجيل الحضور" })
    expect((waiting as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("يبدأ تسجيل الحضور عند الساعة 22:30")).toBeTruthy()
    expect(screen.queryByRole("link")).toBeNull()
    // The start minute arrives: no reload, the link appears
    act(() => {
      vi.setSystemTime(tunis("2026-11-14", "22:30"))
      vi.advanceTimersByTime(15_000)
    })
    const link = screen.getByRole("link", { name: "تسجيل الحضور" })
    expect(link.getAttribute("href")).toBe("/teacher/sessions/se1/attendance")
    expect(screen.queryByText(/يبدأ تسجيل الحضور/)).toBeNull()
  })

  it("exactly at the start, and after the end: enabled", () => {
    vi.setSystemTime(tunis("2026-11-14", "22:30"))
    const { unmount } = render(<AttendanceAction row={row()} />)
    expect(screen.getByRole("link", { name: "تسجيل الحضور" })).toBeTruthy()
    unmount()
    vi.setSystemTime(tunis("2026-11-15", "08:00"))
    render(<AttendanceAction row={row({}, "COMPLETE")} />)
    expect(screen.getByRole("link", { name: "تعديل الحضور" }).getAttribute("href")).toBe("/admin/sessions/se1/attendance")
  })

  it("a later day: disabled with its day", () => {
    vi.setSystemTime(tunis("2026-11-14", "10:00"))
    render(<AttendanceAction row={row({ date: "2026-11-16", start: "17:00" })} />)
    expect((screen.getByRole("button", { name: "تسجيل الحضور" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/^يبدأ تسجيل الحضور يوم .* عند الساعة 17:00$/)).toBeTruthy()
  })

  it("a cancelled lesson shows no attendance action", () => {
    vi.setSystemTime(tunis("2026-11-14", "23:00"))
    const { container } = render(<AttendanceAction row={row({ status: "CANCELLED" })} />)
    expect(container.textContent).toBe("")
  })

  it("Africa/Tunis decides, across midnight UTC: 23:20 UTC is 00:20 the next day", () => {
    vi.setSystemTime(new Date("2026-11-14T23:10:00Z"))
    render(<AttendanceAction row={row({ date: "2026-11-15", start: "00:15" })} />)
    expect((screen.getByRole("button", { name: "تسجيل الحضور" }) as HTMLButtonElement).disabled).toBe(true)
    act(() => {
      vi.setSystemTime(new Date("2026-11-14T23:20:00Z"))
      vi.advanceTimersByTime(15_000)
    })
    expect(screen.getByRole("link", { name: "تسجيل الحضور" })).toBeTruthy()
  })
})
