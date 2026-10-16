import { screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { notificationHref } from "@/lib/communication"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { UserNotification } from "@/types/domain"

import { AttendancePeriodStats, monthRange } from "./attendance-period-stats"

// The current academic year (the real hook reads the session's account)
vi.mock("@/lib/store/settings", () => ({
  useAcademicYears: () => [
    {
      id: "y1", label: "2026-2027", isCurrent: true, startDate: "2026-09-01", endDate: "2027-06-30",
      semesters: { S1: { startDate: "2026-09-01", endDate: "2027-01-14" }, S2: { startDate: "2027-01-15", endDate: "2027-06-30" } },
    },
  ],
}))

const totals = (attended: number, absent: number, excused: number) => ({
  recorded: attended + absent + excused, present: attended, late: 0, absent, excused,
  attended, eligible: attended + absent, rate: attended + absent ? Math.round((attended / (attended + absent)) * 1000) / 10 : null,
  from: null, to: null,
})

function routeFetch(month: object, yearly: object) {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/attendance/summary")) return json(200, url.includes("from=2026-09-01") ? yearly : month)
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return calls
}

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["STUDENT"]))
})

describe("monthly / yearly attendance", () => {
  it("month boundaries cover the whole month (leap years included)", () => {
    expect(monthRange(2026, 10)).toEqual({ from: "2026-10-01", to: "2026-10-31" })
    expect(monthRange(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" })
    expect(monthRange(2026, 12)).toEqual({ from: "2026-12-01", to: "2026-12-31" })
  })

  it("shows the API's attended / eligible and rate; nothing counted → «0 / 0» and «—», never 0% or 100%", async () => {
    const calls = routeFetch(totals(0, 0, 2), totals(9, 3, 1))
    renderWithClient(
      <DirectionProvider dir="rtl">
        <AttendancePeriodStats subject={{ kind: "student", scope: "student" }} />
      </DirectionProvider>
    )
    const monthCard = (await screen.findByRole("heading", { name: "الحضور الشهري" })).closest("div.rounded-xl") as HTMLElement
    const yearCard = screen.getByRole("heading", { name: "الحضور السنوي" }).closest("div.rounded-xl") as HTMLElement
    expect(await within(monthCard).findByText("0 / 0")).toBeTruthy()
    expect(within(monthCard).getByLabelText("نسبة الحضور").textContent).toBe("—")
    expect(await within(yearCard).findByText("9 / 12")).toBeTruthy()
    expect(within(yearCard).getByLabelText("نسبة الحضور").textContent).toBe("75%")
    // The student's own endpoint, the academic year's own dates
    expect(calls.some((u) => u.includes("/student/attendance/summary") && u.includes("from=2026-09-01") && u.includes("to=2027-06-30"))).toBe(true)
  })
})

describe("attendance-change notification link", () => {
  const n = (entityType: UserNotification["entityType"]): UserNotification => ({
    id: "n1", userId: "u1", type: "ATTENDANCE_MODIFIED", title: "تعديل على سجل الحضور", message: "…",
    entityType, entityId: "se1", isRead: false, createdAt: "2026-10-15",
  })
  it("opens the session's attendance page in the current workspace", () => {
    expect(notificationHref(n("SESSION"), "teacher")).toBe("/teacher/sessions/se1/attendance")
    expect(notificationHref(n("SESSION"), "admin")).toBe("/admin/sessions/se1/attendance")
    expect(notificationHref(n("SESSION"), "student")).toBeUndefined()
  })
})
