import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { weeklyScheduleLabel, type Lookups } from "@/lib/domain"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { CreateLinkSheet } from "./admin-onboarding-links"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}

const NBSP = " "
const range = (a: string, b: string) => `${a}${NBSP}–${NBSP}${b}`

describe("weeklyScheduleLabel", () => {
  it("days sharing one time range together, in week order", () => {
    expect(
      weeklyScheduleLabel([
        { day: "THU", start: "08:30", end: "10:30" },
        { day: "TUE", start: "08:30", end: "10:30" },
      ])
    ).toBe(`الثلاثاء والخميس · ${range("08:30", "10:30")}`)
  })

  it("different times: each day with its own range", () => {
    expect(
      weeklyScheduleLabel([
        { day: "SUN", start: "14:00", end: "16:00" },
        { day: "SAT", start: "09:00", end: "11:00" },
      ])
    ).toBe(`السبت · ${range("09:00", "11:00")}، الأحد · ${range("14:00", "16:00")}`)
  })

  it("mixed: shared ranges grouped, others apart", () => {
    expect(
      weeklyScheduleLabel([
        { day: "SAT", start: "14:00", end: "16:00" },
        { day: "SUN", start: "14:00", end: "16:00" },
        { day: "WED", start: "17:00", end: "18:30" },
      ])
    // The platform's week order (WEEK_ORDER: Monday first), as in every schedule view
    ).toBe(`الأربعاء · ${range("17:00", "18:30")}، السبت والأحد · ${range("14:00", "16:00")}`)
  })

  it("no weekly schedule", () => {
    expect(weeklyScheduleLabel([])).toBe("المواعيد غير محددة")
  })
})

/** حمدي الشوك supervises three classes of the same group; another class has no slot. */
const lookups: Lookups = {
  branches: [{ id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [],
  groups: [{ id: "g1", name: "الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" }],
  groupClasses: ["c1", "c2", "c3", "c4"].map((id) => ({ id, groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: [], status: id === "c4" ? "INACTIVE" : "ACTIVE" })),
  teachers: [{ id: "t1", firstName: "حمدي", lastName: "الشوك", phone: "", status: "ACTIVE", joinedAt: "2024-09-01" }],
  // The running classes' slots only (as /admin/schedules returns by default)
  schedules: [],
}
const slot = (id: string, cls: string, dayOfWeek: string, startTime: string, endTime: string) => ({
  id, dayOfWeek, startTime, endTime, room: { id: "r1", name: "القاعة 1" },
  groupClass: { id: cls, group: { id: "g1", name: "الماهر" } }, additionalClasses: [],
})

function routeFetch() {
  const posts: unknown[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)))
        return json(201, { url: "https://x/student-info/t", groupClass: { group: { name: "الماهر" }, branch: { name: "فرع المركز" } } })
      }
      if (url.pathname.endsWith("/admin/schedules") && url.searchParams.get("includeInactive") === "true")
        return json(200, [
          slot("s1", "c1", "TUE", "08:30", "10:30"),
          slot("s2", "c1", "THU", "08:30", "10:30"),
          slot("s3", "c2", "SAT", "14:00", "16:00"),
          slot("s4", "c2", "SUN", "14:00", "16:00"),
          slot("s5", "c3", "MON", "09:00", "11:00"),
          slot("s6", "c3", "WED", "15:00", "17:00"),
          // An inactive class's slot (absent from the default list)
          slot("s7", "c4", "FRI", "10:00", "12:00"),
        ])
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return posts
}

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("«إنشاء رابط استكمال» — القسم", () => {
  it("each class: its name and its own weekly schedule; the id is what is sent", async () => {
    const posts = routeFetch()
    renderWithClient(
      <DirectionProvider dir="rtl">
        <CreateLinkSheet open onOpenChange={() => {}} lookups={lookups} onCreated={() => {}} />
      </DirectionProvider>
    )
    const sheet = await screen.findByRole("dialog")
    fireEvent.click(within(sheet).getByRole("combobox", { name: /الفرع/ }))
    fireEvent.click(await screen.findByRole("option", { name: "فرع المركز" }))
    fireEvent.click(within(sheet).getByRole("combobox", { name: /المجموعة/ }))
    fireEvent.click(await screen.findByRole("option", { name: "الماهر" }))
    fireEvent.click(within(sheet).getByRole("combobox", { name: /القسم/ }))
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(4))
    const labels = screen.getAllByRole("option").map((o) => o.textContent)
    expect(labels).toEqual([
      `قسم حمدي الشوك — الثلاثاء والخميس · ${range("08:30", "10:30")}`,
      `قسم حمدي الشوك — السبت والأحد · ${range("14:00", "16:00")}`,
      `قسم حمدي الشوك — الاثنين · ${range("09:00", "11:00")}، الأربعاء · ${range("15:00", "17:00")}`,
      `قسم حمدي الشوك — الجمعة · ${range("10:00", "12:00")}`,
    ])
    expect(new Set(labels).size).toBe(4)
    // Pick the second one: its id is submitted, not its label
    fireEvent.click(screen.getAllByRole("option")[1])
    fireEvent.click(within(sheet).getByRole("button", { name: "إنشاء الرابط" }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ groupClassId: "c2" })
  })

  it("a class without a weekly schedule says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(200, [])))
    renderWithClient(
      <DirectionProvider dir="rtl">
        <CreateLinkSheet open onOpenChange={() => {}} lookups={{ ...lookups, groupClasses: [lookups.groupClasses[0]] }} onCreated={() => {}} />
      </DirectionProvider>
    )
    const sheet = await screen.findByRole("dialog")
    fireEvent.click(within(sheet).getByRole("combobox", { name: /الفرع/ }))
    fireEvent.click(await screen.findByRole("option", { name: "فرع المركز" }))
    fireEvent.click(within(sheet).getByRole("combobox", { name: /المجموعة/ }))
    fireEvent.click(await screen.findByRole("option", { name: "الماهر" }))
    fireEvent.click(within(sheet).getByRole("combobox", { name: /القسم/ }))
    expect((await screen.findByRole("option")).textContent).toBe("قسم حمدي الشوك — المواعيد غير محددة")
  })
})
