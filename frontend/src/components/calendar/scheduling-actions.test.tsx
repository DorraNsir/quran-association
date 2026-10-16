import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SessionsView } from "@/components/sessions/sessions-view"
import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { todayInTunis } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { ExtraSessionSheet } from "./scheduling-actions"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))

const lookups: Lookups = {
  branches: [{ id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [
    { id: "r1", branchId: "b1", name: "القاعة 1", status: "ACTIVE" },
    { id: "r2", branchId: "b1", name: "القاعة 2", status: "ACTIVE" },
  ],
  groups: [{ id: "g1", name: "مجموعة الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" }],
  groupClasses: [{ id: "c1", groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" }],
  teachers: [],
  // The class's usual room: r2 (from its weekly slot)
  schedules: [{ id: "s1", groupClassId: "c1", day: "MON", start: "09:00", end: "10:00", roomId: "r2" }],
}
const emptyPage = { data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 1 } }

/** Records POST bodies; answers lists with empty pages. */
function routeFetch(onPost: () => Response = () => json(201, { id: "se1" })) {
  const posts: { url: string; body: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return onPost()
      }
      if (url.includes("/platform-preferences"))
        return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
      if (url.includes("/sessions")) return json(200, emptyPage)
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return posts
}

const renderSheet = () =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <ExtraSessionSheet open onOpenChange={() => {}} lookups={lookups} preset={{ groupClassId: "c1" }} />
    </DirectionProvider>
  )

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("sessions page — scheduling actions", () => {
  it("offers «برمجة موعد أسبوعي» and «حصة إضافية», and no longer «إكمال الحصص الناقصة»", async () => {
    routeFetch()
    renderWithClient(
      <DirectionProvider dir="rtl">
        <SessionsView lookups={lookups} today={todayInTunis()} />
      </DirectionProvider>
    )
    expect((await screen.findAllByRole("button", { name: "برمجة موعد أسبوعي" })).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "حصة إضافية" })).toBeTruthy()
    expect(screen.queryByText("إكمال الحصص الناقصة")).toBeNull()
  })
})

describe("«حصة إضافية (مرة واحدة)» form", () => {
  it("starts today, in the class's usual room, and refuses a past date without calling the API", async () => {
    const posts = routeFetch()
    renderSheet()
    const dialog = await screen.findByRole("dialog")
    const date = within(dialog).getByLabelText(/التاريخ/) as HTMLInputElement
    expect(date.value).toBe(todayInTunis())
    expect(date.min).toBe(todayInTunis())
    expect(within(dialog).getByRole("combobox", { name: /القاعة/ }).textContent).toContain("القاعة 2")
    fireEvent.change(date, { target: { value: "2020-01-01" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "برمجة الحصة الإضافية" }))
    expect(await within(dialog).findByText("لا يمكن برمجة حصة إضافية في تاريخ سابق")).toBeTruthy()
    expect(posts).toHaveLength(0)
  })

  it("creates one session through the extra-session endpoint", async () => {
    const posts = routeFetch()
    renderSheet()
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "برمجة الحصة الإضافية" }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].url).toContain("/admin/sessions/extra")
    expect(posts[0].body).toEqual({ groupClassId: "c1", roomId: "r2", date: todayInTunis(), startTime: "09:00", endTime: "10:30" })
  })

  it("shows the API's Arabic refusal (e.g. a room conflict) in the form", async () => {
    const message = "القاعة محجوزة في هذا الوقت"
    routeFetch(() => json(409, { code: "ROOM_CONFLICT", message }))
    renderSheet()
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "برمجة الحصة الإضافية" }))
    expect(await within(dialog).findByText(message)).toBeTruthy()
  })
})
