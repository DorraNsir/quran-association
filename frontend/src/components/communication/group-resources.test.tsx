import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import type { Lookups } from "@/lib/domain"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { GroupResources } from "./resources-views"

const lookups: Lookups = {
  branches: [{ id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [],
  groups: [
    { id: "g1", name: "مجموعة الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
    { id: "g2", name: "مجموعة الأرقم", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
  ],
  groupClasses: [{ id: "c1", groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" }],
  teachers: [],
  schedules: [],
}
const resource = (id: string, title: string, extra: object = {}) => ({
  id, title, description: "وصف", type: "EXTERNAL_LINK", externalUrl: "https://example.org", file: null,
  visibility: "GROUP", groups: [{ id: "g1", name: "مجموعة الماهر" }], groupClasses: [],
  publishedBy: { id: "u1", firstName: "أحمد", lastName: "المؤدب" }, canManage: true,
  createdAt: "2026-10-10T09:00:00Z", updatedAt: "2026-10-10T09:00:00Z", ...extra,
})
const page = (data: object[]) => ({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } })

/** Answers by URL (the tab also loads platform preferences); records every request. */
function routeFetch(resources: object[]) {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/admin/resources")) return json(200, page(resources))
      if (url.includes("/platform-preferences")) return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return calls
}

function renderTab() {
  return renderWithClient(
    <DirectionProvider dir="rtl">
      <GroupResources groupId="g1" lookups={lookups} />
    </DirectionProvider>
  )
}

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("group page — «الموارد» tab", () => {
  it("lists the resources aimed at this group or one of its classes (from the API)", async () => {
    const calls = routeFetch([
      resource("r1", "ملخص سورة البقرة"),
      resource("r2", "تسجيل الحصة", { visibility: "GROUP_CLASS", groups: [], groupClasses: [{ id: "c1", group: { id: "g1", name: "مجموعة الماهر" }, branch: { id: "b1", name: "فرع المركز" } }] }),
    ])
    renderTab()
    expect(await screen.findByText("ملخص سورة البقرة")).toBeTruthy()
    expect(screen.getByText("تسجيل الحصة")).toBeTruthy()
    const url = new URL(calls.find((c) => c.includes("/admin/resources"))!)
    expect(url.pathname).toBe("/api/admin/resources")
    expect(url.searchParams.get("groupId")).toBe("g1")
    expect(screen.queryByText(/قريبًا|قريباً/)).toBeNull()
  })

  it("empty: explains it and offers to add one", async () => {
    routeFetch([])
    renderTab()
    expect(await screen.findByText("لا توجد موارد لهذه المجموعة بعد")).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "إضافة مورد" }).length).toBeGreaterThan(0)
  })

  it("a new resource starts aimed at this group", async () => {
    routeFetch([])
    renderTab()
    fireEvent.click((await screen.findAllByRole("button", { name: "إضافة مورد" }))[0])
    const dialog = await screen.findByRole("dialog")
    // Visibility «مجموعة محددة», with this group already selected
    await waitFor(() => expect(within(dialog).getByText("مجموعة الماهر")).toBeTruthy())
    expect(within(dialog).queryByText("مجموعة الأرقم")).toBeNull()
  })
})
