import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { WorkItem, WorkProgram, WorkSession } from "@/types/work-followup"

import { WorkFollowupProvider } from "./work-followup-provider"
import { WorkFollowupScreen } from "./work-followup-screen"
import { WorkProgramDetails } from "./work-program-details"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// The teacher's classes and students (GET /api/teacher/workspace)
vi.mock("@/lib/api/workspace", () => ({
  useTeacherWorkspace: () => ({
    data: {
      lookups: {
        branches: [{ id: "b1", name: "الفرع الأول", address: "", status: "ACTIVE" }],
        rooms: [],
        groups: [{ id: "g1", name: "مجموعة الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" }],
        groupClasses: [{ id: "c1", groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" }],
        teachers: [],
        schedules: [],
      },
      students: [{ id: "s1", firstName: "درة", lastName: "نصير", groupClassId: "c1", status: "ACTIVE" }],
    },
  }),
}))

const session = (id: string, date: string): WorkSession => ({
  id,
  date,
  startTime: "16:00",
  endTime: "18:00",
  status: "SCHEDULED",
  groupClassId: "c1",
  groupName: "مجموعة الماهر",
  branchName: "الفرع الأول",
})
const item = (id: string, fields: Partial<WorkItem>): WorkItem => ({
  id,
  version: 1,
  position: 0,
  type: "REVISION",
  description: "وصف",
  status: "NOT_EVALUATED",
  recitationNumber: null,
  evaluationComment: null,
  evaluatedAt: null,
  evaluatedBy: null,
  carriedFrom: null,
  continuedFrom: null,
  carriedTo: [],
  continuedBy: [],
  ...fields,
})
const program: WorkProgram = {
  id: "p1",
  version: 3,
  student: { id: "s1", firstName: "درة", lastName: "نصير", photoUrl: null },
  session: session("ses1", "2099-10-19"),
  generalNotes: null,
  lastEditedBy: "مريم بن علي",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  progress: { total: 4, active: 3, completed: 1, pending: 1, unfinished: 1, cancelled: 1, rate: 33.3 },
  items: [
    item("i1", { description: "مراجعة من سورة الزمر إلى سورة الناس\nمع التركيز على المدود", status: "COMPLETED", version: 2 }),
    item("i2", {
      type: "RECITATION",
      description: "إكمال العرضة الثانية من سورة التوبة",
      recitationNumber: 2,
      carriedFrom: { itemId: "old", programId: "p0", sessionId: "ses0", sessionDate: "2099-10-15", status: "POSTPONED" },
    }),
    item("i3", { type: "EXAM", description: "اختبار من سورة الروم", status: "CANCELLED", version: 4 }),
    item("i4", { type: "MEMORIZATION", description: "حفظ صفحتين من سورة البقرة", status: "PARTIAL" }),
  ],
}

/** Answers like the API; records every request. */
function routeFetch(overrides: { evaluation?: () => Response; get?: () => Response } = {}) {
  const calls: { method: string; path: string; search: URLSearchParams; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? "GET"
      calls.push({ method, path: url.pathname, search: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const path = url.pathname.replace(/^\/api/, "")
      if (path === "/teacher/work-programs") return json(200, { data: [program], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } })
      if (path === "/teacher/work-programs/session-options") return json(200, [program.session])
      if (path === "/teacher/work-programs/eligible-sessions")
        return json(200, [{ ...session("ses2", "2099-10-22"), programId: null }, { ...session("ses1", "2099-10-19"), programId: "p1" }])
      if (path === "/teacher/work-programs/p1/evaluation") return (overrides.evaluation ?? (() => json(200, program)))()
      if (path === "/teacher/work-programs/p1" && method === "GET") return (overrides.get ?? (() => json(200, program)))()
      if (path === "/teacher/work-programs/p1") return json(200, program)
      if (path.startsWith("/teacher/work-items/")) return json(201, { ...program, id: "p2" })
      return json(404, { code: "NOT_FOUND", message: "غير موجود" })
    })
  )
  return calls
}

const renderIn = (ui: React.ReactNode) =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <WorkFollowupProvider>{ui}</WorkFollowupProvider>
    </DirectionProvider>
  )

// jsdom lacks what Radix Select calls when an option list opens
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["TEACHER"]))
})

describe("«متابعة العمل» — list (API)", () => {
  it("one clickable card per program: two-item preview, the rest counted, the API's progress", async () => {
    routeFetch()
    renderIn(<WorkFollowupScreen />)
    const link = await screen.findByRole("link", { name: /برنامج عمل درة نصير/ })
    expect(link.getAttribute("href")).toBe("/teacher/work-followup/p1")
    const card = link.closest("[data-slot=card]") as HTMLElement
    expect(within(card).getAllByRole("listitem")).toHaveLength(2)
    expect(within(card).getByText("+ 2 أعمال أخرى")).toBeTruthy()
    expect(within(card).getByText("تم إنجاز 1 من أصل 3 أعمال نشطة")).toBeTruthy()
    expect(within(card).getByText(/عمل ملغى واحد/)).toBeTruthy()
    const preview = within(card).getByText(/مراجعة من سورة الزمر/)
    expect(preview.className).toMatch(/line-clamp-2.*\[overflow-wrap:anywhere\]/)
  })

  it("filters are sent to the server (period tab → ?period=past, page reset)", async () => {
    const calls = routeFetch()
    renderIn(<WorkFollowupScreen />)
    await screen.findByRole("link", { name: /برنامج عمل درة نصير/ })
    fireEvent.click(screen.getByRole("tab", { name: "الحصص السابقة" }))
    await waitFor(() => expect(calls.some((c) => c.path === "/api/teacher/work-programs" && c.search.get("period") === "past")).toBe(true))
    expect(calls.filter((c) => c.path === "/api/teacher/work-programs").at(-1)!.search.get("page")).toBe("1")
  })

  it("evaluation sends only the changed item, with the version it was loaded at", async () => {
    const calls = routeFetch()
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: "تقييم الأعمال" }))
    const sheet = screen.getByRole("dialog")
    const group = within(sheet).getByRole("radiogroup", { name: /حفظ صفحتين/ })
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["لم يُقيّم بعد", "منجز", "غير منجز", "جزئي", "مؤجل", "ملغى"])
    fireEvent.click(within(group).getByRole("radio", { name: "منجز" }))
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ التقييم" }))
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({
      path: "/api/teacher/work-programs/p1/evaluation",
      body: { items: [{ id: "i4", version: 1, status: "COMPLETED", evaluationComment: null }] },
    })
  })

  it("a stale evaluation shows the API's Arabic conflict message (nothing is silently overwritten)", async () => {
    const message = "عدّل مستخدم آخر هذا العمل في الأثناء: أعد تحميل الصفحة لرؤية آخر القيم ثم أعد المحاولة"
    routeFetch({ evaluation: () => json(409, { code: "WORK_ITEM_CHANGED", message }) })
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: "تقييم الأعمال" }))
    const sheet = screen.getByRole("dialog")
    fireEvent.click(within(within(sheet).getByRole("radiogroup", { name: /حفظ صفحتين/ })).getByRole("radio", { name: "منجز" }))
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ التقييم" }))
    expect(await within(sheet).findByText(message)).toBeTruthy()
  })

  it("editing: saved items cannot be removed; only changed items are sent, with their versions", async () => {
    const calls = routeFetch()
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: "تعديل البرنامج" }))
    const sheet = screen.getByRole("dialog")
    const fields = within(sheet).getAllByLabelText("وصف العمل")
    expect(fields).toHaveLength(4)
    expect(fields.every((f) => f.tagName === "TEXTAREA")).toBe(true)
    expect(within(sheet).queryByRole("button", { name: /حذف العمل/ })).toBeNull()
    fireEvent.change(fields[0], { target: { value: "مراجعة سورة الزمر" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "إضافة عمل آخر" }))
    fireEvent.change(within(sheet).getAllByLabelText("وصف العمل")[4], { target: { value: "اختبار جديد" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ برنامج العمل" }))
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
      items: [{ id: "i1", version: 2, type: "REVISION", description: "مراجعة سورة الزمر", recitationNumber: null }],
      newItems: [{ type: "REVISION", description: "اختبار جديد", recitationNumber: null }],
    })
  })
})

describe("«متابعة العمل» — program page (API)", () => {
  it("every item in full, with where carried work came from", async () => {
    routeFetch()
    renderIn(<WorkProgramDetails programId="p1" />)
    expect(await screen.findByRole("heading", { name: "برنامج عمل درة نصير" })).toBeTruthy()
    const full = screen.getByText(/مراجعة من سورة الزمر/)
    expect(full.textContent).toContain("\n")
    expect(full.className).not.toMatch(/line-clamp/)
    expect(screen.getByText(/منقول من حصة سابقة: .* — مؤجل/)).toBeTruthy()
  })

  it("a cancelled item is carried to a later session of the same student", async () => {
    const calls = routeFetch()
    renderIn(<WorkProgramDetails programId="p1" />)
    const cancelled = (await screen.findByText("اختبار من سورة الروم")).closest("li")!
    expect(within(cancelled).getByText("ملغى")).toBeTruthy()
    fireEvent.click(within(cancelled).getByRole("button", { name: "نقل إلى الحصة القادمة" }))
    const dialog = screen.getByRole("dialog")
    await within(dialog).findByRole("combobox")
    // Sessions later than the source only
    expect(calls.find((c) => c.path.endsWith("/eligible-sessions"))!.search.get("afterSessionId")).toBe("ses1")
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد" }))
    await waitFor(() => expect(calls.some((c) => c.path === "/api/teacher/work-items/i3/transfer")).toBe(true))
    expect(calls.find((c) => c.path === "/api/teacher/work-items/i3/transfer")!.body).toEqual({ targetSessionId: "ses2" })
  })

  it("a program the teacher may not see is «not found», with a way back", async () => {
    routeFetch({ get: () => json(403, { code: "TEACHER_CLASS_ACCESS_DENIED", message: "x" }) })
    renderIn(<WorkProgramDetails programId="p1" />)
    expect(await screen.findByText("برنامج العمل غير موجود")).toBeTruthy()
    expect(screen.getByRole("link", { name: "العودة إلى متابعة العمل" }).getAttribute("href")).toBe("/teacher/work-followup")
  })
})

describe("«متابعة العمل» — create form (API)", () => {
  it("lists the student's eligible sessions and offers to edit an existing program instead of a duplicate", async () => {
    const calls = routeFetch()
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: "إضافة برنامج عمل" }))
    const sheet = screen.getByRole("dialog")
    expect(within(sheet).queryByLabelText(/التاريخ/)).toBeNull()
    // Choose the student (Radix select) then a session that already has a program
    fireEvent.click(within(sheet).getByRole("combobox", { name: /الطالب/ }))
    fireEvent.click(await screen.findByRole("option", { name: "درة نصير" }))
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/eligible-sessions") && c.search.get("studentId") === "s1")).toBe(true))
    fireEvent.click(await within(sheet).findByRole("combobox", { name: /الحصة القادمة/ }))
    fireEvent.click(await screen.findByRole("option", { name: /يوجد برنامج/ }))
    expect(await within(sheet).findByText("يوجد برنامج عمل لهذه الحصة. هل تريد تعديله؟")).toBeTruthy()
    expect(within(sheet).getByRole("button", { name: "حفظ برنامج العمل" })).toHaveProperty("disabled", true)
  })
})
