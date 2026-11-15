import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { clearSession, setSession } from "@/lib/api/session"
import { addDays, todayInTunis } from "@/lib/dates"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { SessionRowActions } from "./session-row-actions"
import type { SessionRow } from "./use-session-rows"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const TODAY = todayInTunis()
const row = (over: Partial<SessionRow["session"]> = {}, recorded = 0) =>
  ({
    session: { id: "se1", groupClassId: "c1", scheduleId: "", roomId: "r1", date: addDays(TODAY, 1), start: "11:45", end: "12:45", status: "SCHEDULED", ...over },
    group: { id: "g1", name: "مجموعة الماهر" },
    branch: { id: "b1", name: "فرع المركز" },
    supervisor: { id: "t1", firstName: "أحمد", lastName: "المشرف", status: "ACTIVE" },
    assistants: [],
    progress: { state: "UPCOMING", recorded, expected: 3 },
    summary: { recorded, present: 0, absent: 0, late: 0, excused: 0, rate: null },
  }) as unknown as SessionRow

function routeFetch() {
  const writes: { method: string; url: string; body: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      writes.push({ method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return json(200, {})
    })
  )
  return writes
}
const openMenu = () =>
  fireEvent.pointerDown(screen.getByRole("button", { name: "إجراءات الحصة" }), { button: 0, ctrlKey: false })

beforeEach(() => {
  clearSession()
  setSession(authResponse("teacher", ["TEACHER"]))
})

describe("sessions page — row action of an upcoming lesson", () => {
  it("the supervisor: no waiting attendance text, a ⋮ menu with «إلغاء الحصة» (teacher endpoint)", async () => {
    const writes = routeFetch()
    renderWithClient(<SessionRowActions row={row()} workspace="teacher" myTeacherId="t1" />)
    expect(screen.queryByText(/يبدأ تسجيل الحضور/)).toBeNull()
    expect(screen.queryByRole("button", { name: "تسجيل الحضور" })).toBeNull()
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "إلغاء الحصة" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء الحصة" }))
    await waitFor(() => expect(writes.filter((w) => w.method === "POST")).toHaveLength(1))
    expect(writes.find((w) => w.method === "POST")).toMatchObject({ url: expect.stringContaining("/teacher/sessions/se1/cancel"), body: {} })
  })

  it("an assistant (not the supervisor), or a lesson with attendance: nothing", () => {
    routeFetch()
    const { container, unmount } = renderWithClient(<SessionRowActions row={row()} workspace="teacher" myTeacherId="t2" />)
    expect(container.textContent).toBe("")
    unmount()
    const withRecords = renderWithClient(<SessionRowActions row={row({}, 1)} workspace="teacher" myTeacherId="t1" />)
    expect(withRecords.container.textContent).toBe("")
  })

  it("a lesson that has started keeps «تسجيل الحضور»; a cancelled one shows nothing", () => {
    routeFetch()
    const { unmount } = renderWithClient(<SessionRowActions row={row({ date: addDays(TODAY, -1) })} workspace="teacher" myTeacherId="t1" />)
    expect(screen.getByRole("link", { name: "تسجيل الحضور" }).getAttribute("href")).toBe("/teacher/sessions/se1/attendance")
    expect(screen.queryByRole("button", { name: "إجراءات الحصة" })).toBeNull()
    unmount()
    const cancelled = renderWithClient(<SessionRowActions row={row({ status: "CANCELLED" })} workspace="teacher" myTeacherId="t1" />)
    expect(cancelled.container.textContent).toBe("")
  })

  it("admin: the ⋮ menu cancels through the admin endpoint", async () => {
    setSession(authResponse("admin"))
    const writes = routeFetch()
    renderWithClient(<SessionRowActions row={row()} workspace="admin" />)
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "إلغاء الحصة" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إلغاء الحصة" }))
    await waitFor(() => expect(writes.some((w) => w.method === "PATCH")).toBe(true))
    expect(writes.find((w) => w.method === "PATCH")).toMatchObject({
      url: expect.stringContaining("/admin/sessions/se1/status"),
      body: { status: "CANCELLED" },
    })
  })
})
