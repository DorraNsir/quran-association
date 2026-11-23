import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import {
  canonicalOf,
  OVERALL_BLOCKED,
  OVERALL_EVALUATION,
  overallChangeText,
  overallPendingNote,
  PERFORMANCE_LABEL,
  completionParts,
  WORK_PERFORMANCES,
  workTypeBadges,
  WORKLOAD_ORDER,
} from "@/lib/quran-reference/work-assignment"
import { sessionLabel } from "@/lib/work-followup"
import type { WorkItem, WorkloadOrder, WorkProgram, WorkSession } from "@/types/work-followup"

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
  assignment: null,
  workload: null,
  ...fields,
})
const program: WorkProgram = {
  id: "p1",
  version: 3,
  student: { id: "s1", firstName: "درة", lastName: "نصير", photoUrl: null },
  // A lesson that has started (past): evaluation is open
  session: session("ses1", "2026-10-19"),
  evaluation: { allowed: true, blockedReason: null },
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
function routeFetch(overrides: { evaluation?: () => Response; get?: () => Response; list?: WorkProgram; create?: () => Response } = {}) {
  const calls: { method: string; path: string; search: URLSearchParams; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? "GET"
      calls.push({ method, path: url.pathname, search: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const path = url.pathname.replace(/^\/api/, "")
      if (path === "/teacher/work-programs" && method === "POST" && overrides.create) return overrides.create()
      if (path === "/teacher/work-programs")
        return json(200, { data: [overrides.list ?? program], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } })
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
// …and what Radix Checkbox measures
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["TEACHER"]))
})

describe("«متابعة العمل» — list (API)", () => {
  it("one compact row per program: photo or initial, name linking to the program, the full session date, work-type badges and the exact results — no item previews", async () => {
    routeFetch()
    renderIn(<WorkFollowupScreen />)
    const link = await screen.findByRole("link", { name: /برنامج عمل درة نصير/ })
    expect(link.getAttribute("href")).toBe("/teacher/work-followup/p1")
    const row = link.closest("li[data-program]") as HTMLElement
    expect(row.getAttribute("data-program")).toBe("p1")
    // work types as soft badges (the same labels as on mobile)
    expect([...row.querySelectorAll("[data-type]")].map((b) => b.textContent)).toEqual(workTypeBadges(program.items.map((i) => i.type)).map((b) => b.label))
    // the exact results, one part per result present — never «كل الأعمال منجزة» with dropped work
    expect([...row.querySelectorAll("[data-result]")].map((r) => r.textContent)).toEqual(completionParts(program.items.map((i) => i.status)).map((p) => p.text))
    expect(row.textContent).not.toMatch(/كل الأعمال/)
    expect(within(row).getByText("د")).toBeTruthy() // no photo: the first letter of the name
    expect(row.querySelector("[data-overall]")).toBeNull() // no overall evaluation yet: no badge
    // no item previews, no repeated workload or verification sentence
    expect(within(row).queryByText(/مراجعة من سورة الزمر|قيد التحقق/)).toBeNull()
    // the session's full date
    expect(row.textContent).toContain(sessionLabel(program.session))
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
    fireEvent.click(await screen.findByRole("button", { name: /^تقييم الأعمال/ }))
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
    fireEvent.click(await screen.findByRole("button", { name: /^تقييم الأعمال/ }))
    const sheet = screen.getByRole("dialog")
    fireEvent.click(within(within(sheet).getByRole("radiogroup", { name: /حفظ صفحتين/ })).getByRole("radio", { name: "منجز" }))
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ التقييم" }))
    expect(await within(sheet).findByText(message)).toBeTruthy()
  })

  it("editing: saved items cannot be removed; only changed items are sent, with their versions", async () => {
    const calls = routeFetch()
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: /^تعديل البرنامج/ }))
    const sheet = screen.getByRole("dialog")
    const fields = within(sheet).getAllByLabelText("وصف العمل")
    expect(fields).toHaveLength(4)
    expect(fields.every((f) => f.tagName === "TEXTAREA")).toBe(true)
    expect(within(sheet).queryByRole("button", { name: /حذف العمل/ })).toBeNull()
    fireEvent.change(fields[0], { target: { value: "مراجعة سورة الزمر" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "إضافة عمل آخر" }))
    // A new item is structured only: no «نص حر», no text field — Quranic references are chosen
    const added = within(sheet).getByRole("group", { name: "العمل 5" })
    expect(within(added).queryByRole("radio", { name: "نص حر" })).toBeNull()
    expect(within(added).queryByRole("textbox")).toBeNull()
    for (const [field, option] of [[/^من سورة/, "سورة الملك"], [/^إلى سورة/, "سورة القلم"]] as const) {
      fireEvent.click(within(added).getByRole("combobox", { name: field }))
      fireEvent.change(await screen.findByPlaceholderText("ابحث باسم السورة أو رقمها…"), { target: { value: option.slice(5) } })
      fireEvent.click(await screen.findByRole("option", { name: new RegExp(option) }))
    }
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ برنامج العمل" }))
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
      items: [{ id: "i1", version: 2, type: "REVISION", description: "مراجعة سورة الزمر", recitationNumber: null }],
      newItems: [{ type: "REVISION", recitationNumber: null, assignment: { kind: "SURAH_RANGE", fromSurah: 67, toSurah: 68 } }],
    })
  })
})

describe("«متابعة العمل» — program page (API)", () => {
  it("every item in full, with where carried work came from", async () => {
    routeFetch()
    renderIn(<WorkProgramDetails programId="p1" />)
    // the page's own title; the student's name in the summary card
    expect(await screen.findByRole("heading", { name: "تفاصيل برنامج العمل" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "درة نصير" })).toBeTruthy()
    const full = screen.getByText(/مراجعة من سورة الزمر/)
    expect(full.textContent).toContain("\n")
    expect(full.className).not.toMatch(/line-clamp/)
    expect(screen.getByRole("link", { name: /منقول من حصة سابقة: .* — مؤجل/ })).toBeTruthy()
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

describe("«متابعة العمل» — evaluation follows the session (API)", () => {
  const upcoming: WorkProgram = {
    ...program,
    session: session("ses1", "2099-10-19"),
    evaluation: { allowed: false, blockedReason: "SESSION_NOT_STARTED" },
  }
  const cancelled: WorkProgram = {
    ...program,
    session: { ...session("ses1", "2099-10-19"), status: "CANCELLED" },
    evaluation: { allowed: false, blockedReason: "SESSION_CANCELLED" },
    items: [item("i5", { type: "MEMORIZATION", description: "حفظ سورة الملك" }), ...program.items.slice(1)],
  }

  it("before the session starts: «تقييم الأعمال» is disabled with the reason (list and program page)", async () => {
    routeFetch({ list: upcoming, get: () => json(200, upcoming) })
    const { unmount } = renderIn(<WorkFollowupScreen />)
    const button = await screen.findByRole("button", { name: /^تقييم الأعمال/ })
    expect(button).toHaveProperty("disabled", true)
    expect(screen.getByText("لا يمكن تقييم برنامج العمل قبل بداية الحصة")).toBeTruthy()
    fireEvent.click(button)
    expect(screen.queryByRole("dialog")).toBeNull()
    unmount()
    renderIn(<WorkProgramDetails programId="p1" />)
    expect(await screen.findByRole("button", { name: /^تقييم الأعمال/ })).toHaveProperty("disabled", true)
    expect(screen.getByRole("status").textContent).toBe("لا يمكن تقييم برنامج العمل قبل بداية الحصة")
    // Editing (planning) stays available
    expect(screen.getByRole("button", { name: /^تعديل البرنامج/ })).toHaveProperty("disabled", false)
  })

  it("cancelled session: evaluation disabled; its unevaluated work can still be carried", async () => {
    const calls = routeFetch({ list: cancelled, get: () => json(200, cancelled) })
    renderIn(<WorkProgramDetails programId="p1" />)
    expect(await screen.findByRole("button", { name: /^تقييم الأعمال/ })).toHaveProperty("disabled", true)
    expect(screen.getByRole("status").textContent).toBe("لا يمكن تقييم برنامج العمل لحصة ملغاة")
    const pending = screen.getByText("حفظ سورة الملك").closest("li")!
    fireEvent.click(within(pending).getByRole("button", { name: "نقل إلى الحصة القادمة" }))
    const dialog = screen.getByRole("dialog")
    await within(dialog).findByRole("combobox")
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد" }))
    await waitFor(() => expect(calls.some((c) => c.path === "/api/teacher/work-items/i5/transfer")).toBe(true))
  })

  it("an unevaluated item of a normal session offers no transfer", async () => {
    routeFetch({ get: () => json(200, { ...program, items: [item("i6", { description: "عمل لم يقيّم" })] }) })
    renderIn(<WorkProgramDetails programId="p1" />)
    const row = (await screen.findByText("عمل لم يقيّم")).closest("li")!
    expect(within(row).queryByRole("button", { name: "نقل إلى الحصة القادمة" })).toBeNull()
  })

  it("carried from a cancelled session: «منقول من حصة ملغاة»", async () => {
    const carried = item("i7", {
      description: "حفظ سورة القلم",
      carriedFrom: { itemId: "x", programId: "p0", sessionId: "ses0", sessionDate: "2026-10-15", status: "NOT_EVALUATED" },
    })
    routeFetch({ get: () => json(200, { ...program, items: [carried] }) })
    renderIn(<WorkProgramDetails programId="p1" />)
    expect(await screen.findByRole("link", { name: /^منقول من حصة ملغاة: / })).toBeTruthy()
    expect(screen.getByText("منقول من حصة ملغاة")).toBeTruthy()
  })

  it("the API refuses (the lesson moved / was cancelled meanwhile): its message is shown and the programs reload", async () => {
    const message = "لا يمكن تقييم برنامج العمل قبل بداية الحصة"
    const calls = routeFetch({ evaluation: () => json(409, { code: "WORK_SESSION_NOT_STARTED", message }) })
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: /^تقييم الأعمال/ }))
    const sheet = screen.getByRole("dialog")
    fireEvent.click(within(within(sheet).getByRole("radiogroup", { name: /حفظ صفحتين/ })).getByRole("radio", { name: "منجز" }))
    const listCalls = () => calls.filter((c) => c.method === "GET" && c.path === "/api/teacher/work-programs").length
    const before = listCalls()
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ التقييم" }))
    expect(await within(sheet).findByText(message)).toBeTruthy()
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before))
  })
})

describe("«متابعة العمل» — structured Quranic assignments (Qalun, Tunisian edition)", () => {
  const EDITION = "qalun-abi-nashit-tn-hannibal-mualim-v1"
  const exact = (value: number) => ({ kind: "exact" as const, value, touched: value, dataStatus: "structurally-consistent" })
  const bounded = (greaterThan: number, lessThan: number) => ({
    kind: "bounded" as const,
    greaterThan,
    lessThan,
    touched: lessThan,
    partialAtStart: true,
    partialAtEnd: true,
    dataStatus: "structurally-consistent",
  })
  const workload = (p: Partial<NonNullable<WorkItem["workload"]>> = {}): NonNullable<WorkItem["workload"]> => ({
    editionId: EDITION,
    verses: 15,
    surahs: { whole: 0, touched: 1 },
    pages: exact(3),
    juz: bounded(0, 1),
    hizbs: bounded(0, 1),
    quarters: exact(1),
    eighths: exact(2),
    dataStatus: "structurally-consistent",
    authoritative: false,
    ...p,
  })
  const ayahItem = item("s1", {
    type: "MEMORIZATION",
    version: 3,
    description: "سورة البقرة: من الآية 6 إلى الآية 20",
    assignment: { kind: "AYAH_RANGE", editionId: EDITION, fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 20, fromPage: null, toPage: null },
    workload: workload({ pages: bounded(0, 2) }),
  })
  const pagesItem = item("s2", {
    type: "MEMORIZATION",
    description: "من الصفحة 10 إلى الصفحة 12",
    assignment: { kind: "PAGE_RANGE", editionId: EDITION, fromSurah: 2, fromAyah: 62, toSurah: 2, toAyah: 83, fromPage: 10, toPage: 12 },
    workload: workload(),
  })
  const examItem = item("s3", {
    type: "EXAM",
    description: "مع التركيز على المتشابهات",
    assignment: { kind: "SURAH_RANGE", editionId: EDITION, fromSurah: 46, fromAyah: 1, toSurah: 114, toAyah: 6, fromPage: null, toPage: null },
    workload: workload({ hizbs: { kind: "unavailable", reason: "x" } }),
  })
  const legacyItem = item("s4", { description: "مراجعة حرة كتبها المعلم" })
  const structuredProgram: WorkProgram = { ...program, items: [ayahItem, pagesItem, examItem, legacyItem] }

  /** Opens «إضافة برنامج عمل» with a student and a free session chosen; returns the sheet. */
  async function openCreate() {
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: "إضافة برنامج عمل" }))
    const sheet = screen.getByRole("dialog")
    fireEvent.click(within(sheet).getByRole("combobox", { name: /الطالب/ }))
    fireEvent.click(await screen.findByRole("option", { name: "درة نصير" }))
    fireEvent.click(await within(sheet).findByRole("combobox", { name: /الحصة القادمة/ }))
    fireEvent.click((await screen.findAllByRole("option")).find((o) => !/يوجد برنامج/.test(o.textContent ?? ""))!)
    return sheet
  }
  async function chooseType(sheet: HTMLElement, label: string) {
    fireEvent.click(within(sheet).getByRole("combobox", { name: "نوع العمل" }))
    fireEvent.click(await screen.findByRole("option", { name: label }))
  }
  async function pickSurah(sheet: HTMLElement, field: RegExp, search: string, option: string) {
    fireEvent.click(within(sheet).getByRole("combobox", { name: field }))
    fireEvent.change(await screen.findByPlaceholderText("ابحث باسم السورة أو رقمها…"), { target: { value: search } })
    fireEvent.click(await screen.findByRole("option", { name: new RegExp(option) }))
  }
  const posted = (calls: ReturnType<typeof routeFetch>) => calls.find((c) => c.method === "POST")?.body as { items: unknown[] } | undefined
  const save = (sheet: HTMLElement) => fireEvent.click(within(sheet).getByRole("button", { name: "حفظ برنامج العمل" }))

  it("«متابعة العرضات»: a structured عرضة is numbered by the server — no number field, a short hint instead; nothing numbered is sent", async () => {
    const calls = routeFetch()
    const sheet = await openCreate()
    await chooseType(sheet, "عرضة")
    expect(within(sheet).queryByLabelText("رقم العرضة (اختياري)")).toBeNull()
    expect(within(sheet).getByText("يُحدَّد رقم العرضة تلقائيًا")).toBeTruthy()
    await pickSurah(sheet, /^السورة/, "البقرة", "سورة البقرة")
    save(sheet)
    await waitFor(() => expect(posted(calls)).toBeTruthy())
    expect(posted(calls)!.items).toEqual([{ type: "RECITATION", recitationNumber: null, assignment: { kind: "SURAH_RANGE", fromSurah: 2, toSurah: 2 } }])
  })

  it("«متابعة العرضات» on the program page: the surah and its recitations done, compact, with a link to its history", async () => {
    const tracked = item("r1", {
      type: "RECITATION",
      recitationNumber: 5,
      description: "العرضة الخامسة من سورة البقرة",
      assignment: { kind: "SURAH_RANGE", editionId: "qalun-abi-nashit-tn-hannibal-mualim-v1", fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 286, fromPage: null, toPage: null },
      recitation: { surah: 2, attempts: 4 },
    })
    routeFetch({ get: () => json(200, { ...program, items: [tracked] }) })
    renderIn(<WorkProgramDetails programId="p1" />)
    const history = await screen.findByRole("link", { name: "سجل العرضات — سورة البقرة · 4 عرضات" })
    expect(history.getAttribute("href")).toBe(`/teacher/recitations?student=${program.student.id}&surah=2`)
    expect(history.querySelector("[data-recitation-count]")!.textContent).toBe("4 عرضات")
    // no attempt table inside the item
    expect(document.querySelectorAll("[data-entry]")).toHaveLength(0)
  })

  it("حفظ by verses: searchable surah, verses limited to the surah; the request carries references only", async () => {
    const calls = routeFetch()
    const sheet = await openCreate()
    await chooseType(sheet, "حفظ")
    expect(within(sheet).getByRole("radio", { name: "بالآيات" })).toHaveProperty("ariaChecked", "true")
    await pickSurah(sheet, /^السورة/, "البقرة", "سورة البقرة")
    expect(within(sheet).getByText("عدد آيات السورة: 286")).toBeTruthy()
    fireEvent.change(within(sheet).getByLabelText("من الآية"), { target: { value: "6" } })
    fireEvent.change(within(sheet).getByLabelText("إلى الآية (اختياري)"), { target: { value: "20" } })
    save(sheet)
    await waitFor(() => expect(posted(calls)).toBeTruthy())
    expect(posted(calls)!.items).toEqual([
      { type: "MEMORIZATION", recitationNumber: null, assignment: { kind: "AYAH_RANGE", fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 20 } },
    ])
  })

  it("the surah list holds all 114 surahs in order; search reaches the last ones", async () => {
    routeFetch()
    const sheet = await openCreate()
    await chooseType(sheet, "عرضة")
    fireEvent.click(within(sheet).getByRole("combobox", { name: /^السورة/ }))
    const options = await screen.findAllByRole("option")
    expect(options).toHaveLength(114)
    expect(options.at(-1)!.textContent).toContain("سورة الناس")
    fireEvent.change(screen.getByPlaceholderText("ابحث باسم السورة أو رقمها…"), { target: { value: "الفلق" } })
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["113سورة الفلق"])
  })

  it("verse validation: a verse beyond the surah is refused before sending", async () => {
    const calls = routeFetch()
    const sheet = await openCreate()
    await chooseType(sheet, "حفظ")
    await pickSurah(sheet, /^السورة/, "الفاتحة", "سورة الفاتحة")
    fireEvent.change(within(sheet).getByLabelText("من الآية"), { target: { value: "1" } })
    fireEvent.change(within(sheet).getByLabelText("إلى الآية (اختياري)"), { target: { value: "8" } })
    save(sheet)
    expect(await within(sheet).findByText("آيات هذه السورة من 1 إلى 7")).toBeTruthy()
    fireEvent.change(within(sheet).getByLabelText("من الآية"), { target: { value: "7" } })
    fireEvent.change(within(sheet).getByLabelText("إلى الآية (اختياري)"), { target: { value: "3" } })
    expect(await within(sheet).findByText("الآية الأولى بعد الآية الأخيرة")).toBeTruthy()
    expect(posted(calls)).toBeUndefined()
  })

  it("حفظ by pages: the edition's printed pages (2–604), the verses they hold shown; page 1 refused", async () => {
    const calls = routeFetch()
    const sheet = await openCreate()
    await chooseType(sheet, "حفظ")
    fireEvent.click(within(sheet).getByRole("radio", { name: "بالصفحات" }))
    fireEvent.change(within(sheet).getByLabelText("من الصفحة"), { target: { value: "1" } })
    fireEvent.change(within(sheet).getByLabelText("إلى الصفحة (اختياري)"), { target: { value: "12" } })
    save(sheet)
    expect(await within(sheet).findByText("صفحات القرآن في هذا المصحف من 2 إلى 604")).toBeTruthy()
    fireEvent.change(within(sheet).getByLabelText("من الصفحة"), { target: { value: "10" } })
    expect(within(sheet).getByText(/من سورة البقرة 62 إلى سورة البقرة 83/)).toBeTruthy()
    save(sheet)
    await waitFor(() => expect(posted(calls)).toBeTruthy())
    expect(posted(calls)!.items).toEqual([{ type: "MEMORIZATION", recitationNumber: null, assignment: { kind: "PAGE_RANGE", fromPage: 10, toPage: 12 } }])
  })

  it("حفظ — three modes: «سورة كاملة» sends the surah only (an-Nasr), «بالآيات» one verse without an end, «بالصفحات» one page without an end", async () => {
    const calls = routeFetch()
    const sheet = await openCreate()
    await chooseType(sheet, "حفظ")
    const modes = within(sheet).getAllByRole("radio").map((r) => r.textContent)
    expect(modes.slice(0, 3)).toEqual(["سورة كاملة", "بالآيات", "بالصفحات"])
    // whole surah: only the surah selector; no verse or page field
    fireEvent.click(within(sheet).getByRole("radio", { name: "سورة كاملة" }))
    expect(within(sheet).getByRole("radio", { name: "سورة كاملة" })).toHaveProperty("ariaChecked", "true")
    await pickSurah(sheet, /^السورة/, "النصر", "سورة النصر")
    expect(within(sheet).getByText(/سورة النصر كاملة — عدد آيات السورة: 3/)).toBeTruthy()
    expect(within(sheet).queryByLabelText("من الآية")).toBeNull()
    expect(within(sheet).queryByLabelText("من الصفحة")).toBeNull()
    save(sheet)
    await waitFor(() => expect(posted(calls)).toBeTruthy())
    expect(posted(calls)!.items).toEqual([{ type: "MEMORIZATION", recitationNumber: null, assignment: { kind: "AYAH_RANGE", fromSurah: 110, toSurah: 110 } }])
  })

  it("حفظ — a single verse, the ending verse cleared, then pages typed after verses: no stale field is sent", async () => {
    const calls = routeFetch()
    const sheet = await openCreate()
    await chooseType(sheet, "حفظ")
    await pickSurah(sheet, /^السورة/, "البقرة", "سورة البقرة")
    fireEvent.change(within(sheet).getByLabelText("من الآية"), { target: { value: "255" } })
    fireEvent.change(within(sheet).getByLabelText("إلى الآية (اختياري)"), { target: { value: "260" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "إزالة آية النهاية" }))
    expect((within(sheet).getByLabelText("إلى الآية (اختياري)") as HTMLInputElement).value).toBe("")
    expect(within(sheet).queryByRole("button", { name: "إزالة آية النهاية" })).toBeNull()
    // switch to pages: the verse fields are hidden and not sent
    fireEvent.click(within(sheet).getByRole("radio", { name: "بالصفحات" }))
    expect(within(sheet).queryByLabelText("من الآية")).toBeNull()
    fireEvent.change(within(sheet).getByLabelText("من الصفحة"), { target: { value: "79" } })
    save(sheet)
    await waitFor(() => expect(posted(calls)).toBeTruthy())
    expect(posted(calls)!.items).toEqual([{ type: "MEMORIZATION", recitationNumber: null, assignment: { kind: "PAGE_RANGE", fromPage: 79 } }])
  })

  it("حفظ — back to verses after pages: the single verse is sent without pages; a missing starting page is refused", async () => {
    const calls = routeFetch()
    const sheet = await openCreate()
    await chooseType(sheet, "حفظ")
    fireEvent.click(within(sheet).getByRole("radio", { name: "بالصفحات" }))
    fireEvent.change(within(sheet).getByLabelText("إلى الصفحة (اختياري)"), { target: { value: "82" } })
    save(sheet)
    expect(await within(sheet).findByText("حدّد الصفحة الأولى")).toBeTruthy()
    fireEvent.change(within(sheet).getByLabelText("من الصفحة"), { target: { value: "79" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "إزالة صفحة النهاية" }))
    fireEvent.click(within(sheet).getByRole("radio", { name: "بالآيات" }))
    await pickSurah(sheet, /^السورة/, "البقرة", "سورة البقرة")
    fireEvent.change(within(sheet).getByLabelText("من الآية"), { target: { value: "255" } })
    save(sheet)
    await waitFor(() => expect(posted(calls)).toBeTruthy())
    expect(posted(calls)!.items).toEqual([
      { type: "MEMORIZATION", recitationNumber: null, assignment: { kind: "AYAH_RANGE", fromSurah: 2, fromAyah: 255, toSurah: 2 } },
    ])
  })

  it("حفظ — re-opening: a whole surah in «سورة كاملة», a single verse / page with an empty end; untouched items are not resent", async () => {
    const e = "qalun-abi-nashit-tn-hannibal-mualim-v1"
    const items = [
      item("m1", { type: "MEMORIZATION", version: 1, description: "سورة النصر كاملة", assignment: { kind: "AYAH_RANGE", editionId: e, fromSurah: 110, fromAyah: 1, toSurah: 110, toAyah: 3, fromPage: null, toPage: null } }),
      item("m2", { position: 1, type: "MEMORIZATION", version: 1, description: "سورة البقرة: الآية 255", assignment: { kind: "AYAH_RANGE", editionId: e, fromSurah: 2, fromAyah: 255, toSurah: 2, toAyah: 255, fromPage: null, toPage: null } }),
      item("m3", { position: 2, type: "MEMORIZATION", version: 1, description: "الصفحة 79", assignment: { ...canonicalOf({ kind: "PAGE_RANGE", fromPage: 79, toPage: 79 })!, editionId: e } }),
    ]
    const calls = routeFetch({ list: { ...program, items } })
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: /^تعديل البرنامج/ }))
    const sheet = screen.getByRole("dialog")
    const [whole, verse, page] = [1, 2, 3].map((n) => within(sheet).getByRole("group", { name: `العمل ${n}` }))
    expect(within(whole!).getByRole("radio", { name: "سورة كاملة" })).toHaveProperty("ariaChecked", "true")
    expect(within(whole!).getByRole("combobox", { name: /^السورة/ }).textContent).toContain("سورة النصر")
    expect(within(verse!).getByRole("radio", { name: "بالآيات" })).toHaveProperty("ariaChecked", "true")
    expect((within(verse!).getByLabelText("من الآية") as HTMLInputElement).value).toBe("255")
    expect((within(verse!).getByLabelText("إلى الآية (اختياري)") as HTMLInputElement).value).toBe("")
    expect((within(page!).getByLabelText("من الصفحة") as HTMLInputElement).value).toBe("79")
    expect((within(page!).getByLabelText("إلى الصفحة (اختياري)") as HTMLInputElement).value).toBe("")
    // a real change to the page item only: the two re-opened, untouched items are not resent
    fireEvent.change(within(page!).getByLabelText("إلى الصفحة (اختياري)"), { target: { value: "82" } })
    save(sheet)
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
      items: [{ id: "m3", version: 1, type: "MEMORIZATION", recitationNumber: null, assignment: { kind: "PAGE_RANGE", fromPage: 79, toPage: 82 } }],
    })
  })

  it("مراجعة with optional verses, and عرضة of one whole surah", async () => {
    const calls = routeFetch()
    const sheet = await openCreate()
    await pickSurah(sheet, /^من سورة/, "البقرة", "سورة البقرة")
    await pickSurah(sheet, /^إلى سورة/, "آل عمران", "سورة آل عمران")
    fireEvent.click(within(sheet).getByRole("checkbox"))
    fireEvent.change(within(sheet).getByLabelText(/^من الآية/), { target: { value: "142" } })
    fireEvent.click(within(sheet).getByRole("button", { name: "إضافة عمل آخر" }))
    const types = within(sheet).getAllByRole("combobox", { name: "نوع العمل" })
    fireEvent.click(types[1]!)
    fireEvent.click(await screen.findByRole("option", { name: "عرضة" }))
    await pickSurah(sheet, /^السورة/, "الرحمن", "سورة الرحمن")
    save(sheet)
    await waitFor(() => expect(posted(calls)).toBeTruthy())
    expect(posted(calls)!.items).toEqual([
      { type: "REVISION", recitationNumber: null, assignment: { kind: "SURAH_RANGE", fromSurah: 2, toSurah: 3, fromAyah: 142 } },
      { type: "RECITATION", recitationNumber: null, assignment: { kind: "SURAH_RANGE", fromSurah: 55, toSurah: 55 } },
    ])
  })

  it("edit: structured fields prepopulated; only the changed assignment is sent (no description, no other item)", async () => {
    const calls = routeFetch({ list: structuredProgram })
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: /^تعديل البرنامج/ }))
    const sheet = screen.getByRole("dialog")
    const first = within(sheet).getByRole("group", { name: "العمل 1" })
    expect(within(first).getByRole("combobox", { name: /^السورة/ }).textContent).toContain("سورة البقرة")
    expect((within(first).getByLabelText("من الآية") as HTMLInputElement).value).toBe("6")
    expect((within(first).getByLabelText("إلى الآية (اختياري)") as HTMLInputElement).value).toBe("20")
    const pages = within(sheet).getByRole("group", { name: "العمل 2" })
    expect(within(pages).getByRole("radio", { name: "بالصفحات" })).toHaveProperty("ariaChecked", "true")
    // The legacy item stays free text with its words
    const legacy = within(sheet).getByRole("group", { name: "العمل 4" })
    expect(within(legacy).getByRole("radio", { name: "نص حر" })).toHaveProperty("ariaChecked", "true")
    expect((within(legacy).getByLabelText("وصف العمل") as HTMLTextAreaElement).value).toBe("مراجعة حرة كتبها المعلم")
    fireEvent.change(within(first).getByLabelText("إلى الآية (اختياري)"), { target: { value: "25" } })
    save(sheet)
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
      items: [
        {
          id: "s1",
          version: 3,
          type: "MEMORIZATION",
          recitationNumber: null,
          assignment: { kind: "AYAH_RANGE", fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 25 },
        },
      ],
    })
  })

  it("edit: a legacy item is kept as written, converted only explicitly with valid references; a structured item never goes back to free text", async () => {
    const calls = routeFetch({ list: structuredProgram })
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: /^تعديل البرنامج/ }))
    const sheet = screen.getByRole("dialog")
    // Structured items: no «نص حر», no text field (their saved text stays untouched)
    const exam = within(sheet).getByRole("group", { name: "العمل 3" })
    expect(within(exam).queryByRole("radio", { name: "نص حر" })).toBeNull()
    expect(within(exam).queryByLabelText("وصف العمل")).toBeNull()
    // The legacy item: free text kept, with its words
    const legacy = within(sheet).getByRole("group", { name: "العمل 4" })
    expect(within(legacy).getByRole("radio", { name: "نص حر" })).toHaveProperty("ariaChecked", "true")
    // Explicit conversion: no starting surah is refused, nothing is sent
    fireEvent.click(within(legacy).getByRole("radio", { name: "من سورة إلى سورة" }))
    save(sheet)
    expect(await within(legacy).findByText("اختر سورة البداية")).toBeTruthy()
    expect(calls.some((c) => c.method === "PATCH")).toBe(false)
    // A starting surah alone is enough (the ending surah is optional): that surah
    await pickSurah(legacy, /^من سورة/, "الملك", "سورة الملك")
    save(sheet)
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    const body = calls.find((c) => c.method === "PATCH")!.body as { items: Record<string, unknown>[] }
    // Only the assignment: the legacy words are not resent, so they stay in the record
    expect(body.items).toEqual([
      { id: "s4", version: 1, type: "REVISION", recitationNumber: null, assignment: { kind: "SURAH_RANGE", fromSurah: 67, toSurah: 67 } },
    ])
  })

  it("new items: structured only for the four types; incomplete references are refused, never sent as free text", async () => {
    const calls = routeFetch()
    const sheet = await openCreate()
    const first = within(sheet).getByRole("group", { name: "العمل 1" })
    for (const label of ["حفظ", "مراجعة", "عرضة", "اختبار"]) {
      await chooseType(sheet, label)
      expect(within(first).queryByRole("radio", { name: "نص حر" })).toBeNull()
      expect(within(first).queryByRole("textbox")).toBeNull()
    }
    await chooseType(sheet, "حفظ")
    await pickSurah(first, /^السورة/, "النبأ", "سورة النبأ")
    save(sheet)
    expect(await within(first).findByText("حدّد الآية الأولى")).toBeTruthy()
    expect(posted(calls)).toBeUndefined()
  })

  it("a refusal of the API (e.g. a reversed range) is shown in Arabic; the form keeps its input", async () => {
    const message = "بداية النطاق بعد نهايته"
    routeFetch({ create: () => json(400, { code: "WORK_ASSIGNMENT_REVERSED", message }) })
    const sheet = await openCreate()
    await chooseType(sheet, "عرضة")
    await pickSurah(sheet, /^السورة/, "يس", "سورة يس")
    save(sheet)
    expect(await within(sheet).findByText(message)).toBeTruthy()
    expect(within(sheet).getByRole("combobox", { name: /^السورة/ }).textContent).toContain("سورة يس")
  })

  it("program page: summary, workload with its precision, the teacher's own note; legacy text as written", async () => {
    routeFetch({ get: () => json(200, structuredProgram) })
    renderIn(<WorkProgramDetails programId="p1" />)
    const rows = await screen.findAllByRole("listitem")
    const memo = rows.find((r) => r.textContent?.includes("من الآية 6"))!
    expect(within(memo).getByText("سورة البقرة: من الآية 6 إلى الآية 20")).toBeTruthy()
    // bounded pages are never shown as a number
    expect(within(memo).getByText("أقل من صفحتين").dataset.precision).toBe("bounded")
    expect(within(memo).getByText("15 آية").dataset.precision).toBe("exact")
    // the server's default wording is not repeated as a note
    expect(within(memo).getAllByText(/من الآية 6 إلى الآية 20/)).toHaveLength(1)
    const pages = rows.find((r) => r.textContent?.includes("من الصفحة 10"))!
    expect(within(pages).getByText("من الصفحة 10 إلى الصفحة 12 (البقرة 62 – البقرة 83)")).toBeTruthy()
    expect(within(pages).getByText("3 صفحات").dataset.precision).toBe("exact")
    const exam = rows.find((r) => r.textContent?.includes("الأحقاف"))!
    expect(within(exam).getByText("من سورة الأحقاف إلى سورة الناس")).toBeTruthy()
    expect(within(exam).queryByText("غير متاح")).toBeNull() // unavailable: no fabricated value
    expect(within(exam).getByText("مع التركيز على المتشابهات")).toBeTruthy()
    // the general verification sentence is no longer repeated under each item
    expect(screen.queryByText(/قيد التحقق من النسخة المطبوعة/)).toBeNull()
    expect(screen.getByText("مراجعة حرة كتبها المعلم")).toBeTruthy()
  })
})

describe("«متابعة العمل» — optional ending surah and hizbs + pages (web)", () => {
  const EDITION = "qalun-abi-nashit-tn-hannibal-mualim-v1"
  async function openNew() {
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: "إضافة برنامج عمل" }))
    const sheet = screen.getByRole("dialog")
    fireEvent.click(within(sheet).getByRole("combobox", { name: /الطالب/ }))
    fireEvent.click(await screen.findByRole("option", { name: "درة نصير" }))
    fireEvent.click(await within(sheet).findByRole("combobox", { name: /الحصة القادمة/ }))
    fireEvent.click((await screen.findAllByRole("option")).find((o) => !/يوجد برنامج/.test(o.textContent ?? ""))!)
    return sheet
  }
  async function pick(scope: HTMLElement, field: RegExp, search: string, option: string) {
    fireEvent.click(within(scope).getByRole("combobox", { name: field }))
    fireEvent.change(await screen.findByPlaceholderText("ابحث باسم السورة أو رقمها…"), { target: { value: search } })
    fireEvent.click(await screen.findByRole("option", { name: new RegExp(option) }))
  }
  const postedItems = (calls: ReturnType<typeof routeFetch>) => (calls.find((c) => c.method === "POST")?.body as { items: unknown[] } | undefined)?.items

  it("مراجعة with only a starting surah: that whole surah; the ending surah is labelled optional", async () => {
    const calls = routeFetch()
    const sheet = await openNew()
    const first = within(sheet).getByRole("group", { name: "العمل 1" })
    expect(within(first).getByText("إلى سورة (اختياري)")).toBeTruthy()
    await pick(first, /^من سورة/, "التوبة", "سورة التوبة")
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ برنامج العمل" }))
    await waitFor(() => expect(postedItems(calls)).toBeTruthy())
    expect(postedItems(calls)).toEqual([{ type: "REVISION", recitationNumber: null, assignment: { kind: "SURAH_RANGE", fromSurah: 9, toSurah: 9 } }])
  })

  it("اختبار with two surahs, then the ending surah cleared: the single surah is sent", async () => {
    const calls = routeFetch()
    const sheet = await openNew()
    fireEvent.click(within(sheet).getByRole("combobox", { name: "نوع العمل" }))
    fireEvent.click(await screen.findByRole("option", { name: "اختبار" }))
    const first = within(sheet).getByRole("group", { name: "العمل 1" })
    await pick(first, /^من سورة/, "التوبة", "سورة التوبة")
    await pick(first, /^إلى سورة/, "النور", "سورة النور")
    fireEvent.click(within(first).getByRole("button", { name: "إزالة سورة النهاية" }))
    expect(within(first).getByRole("combobox", { name: /^إلى سورة/ }).textContent).toContain("اختر السورة")
    expect(within(first).queryByRole("button", { name: "إزالة سورة النهاية" })).toBeNull()
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ برنامج العمل" }))
    await waitFor(() => expect(postedItems(calls)).toBeTruthy())
    expect(postedItems(calls)).toEqual([{ type: "EXAM", recitationNumber: null, assignment: { kind: "SURAH_RANGE", fromSurah: 9, toSurah: 9 } }])
  })

  it("editing a single-surah item: no ending surah shown; adding one sends the range", async () => {
    const single = item("t1", {
      type: "REVISION",
      version: 2,
      description: "سورة التوبة",
      assignment: { kind: "SURAH_RANGE", editionId: EDITION, fromSurah: 9, fromAyah: 1, toSurah: 9, toAyah: 129, fromPage: null, toPage: null },
    })
    const calls = routeFetch({ list: { ...program, items: [single] } })
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(await screen.findByRole("button", { name: /^تعديل البرنامج/ }))
    const sheet = screen.getByRole("dialog")
    const first = within(sheet).getByRole("group", { name: "العمل 1" })
    expect(within(first).getByRole("combobox", { name: /^من سورة/ }).textContent).toContain("سورة التوبة")
    expect(within(first).getByRole("combobox", { name: /^إلى سورة/ }).textContent).toContain("اختر السورة")
    await pick(first, /^إلى سورة/, "النور", "سورة النور")
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ برنامج العمل" }))
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
      items: [{ id: "t1", version: 2, type: "REVISION", recitationNumber: null, assignment: { kind: "SURAH_RANGE", fromSurah: 9, toSurah: 24 } }],
    })
  })

  it("program page: one size per item — in hizbs from one hizb (exact or «تقريبًا»), pages below; verse count below 100; exact page hint; no verification sentence", async () => {
    const snap = (extra: Record<string, unknown>, verses: number, pages: unknown = { kind: "exact", value: 21, touched: 21, dataStatus: "x" }) =>
      ({
        editionId: EDITION,
        verses,
        surahs: { whole: 1, touched: 1 },
        pages,
        juz: { kind: "unavailable", reason: "x" },
        hizbs: { kind: "unavailable", reason: "x" },
        quarters: { kind: "unavailable", reason: "x" },
        eighths: { kind: "unavailable", reason: "x" },
        dataStatus: "x",
        authoritative: false,
        ...extra,
      }) as NonNullable<WorkItem["workload"]>
    const a = (from: number, to: number, toAyah: number) => ({ kind: "SURAH_RANGE" as const, editionId: EDITION, fromSurah: from, fromAyah: 1, toSurah: to, toAyah, fromPage: null, toPage: null })
    const bounded = (greaterThan: number, lessThan: number) => ({ kind: "bounded", greaterThan, lessThan, touched: lessThan, partialAtStart: true, partialAtEnd: false, dataStatus: "x" })
    const approx = (hizbs: number) => ({ kind: "approximate", hizbs, step: hizbs >= 10 ? 1 : 0.5, eighths: { greaterThan: 0, lessThan: 1 } })
    routeFetch({
      get: () =>
        json(200, {
          ...program,
          items: [
            item("h1", { type: "REVISION", description: "سورة البقرة", assignment: a(2, 2, 286), workload: snap({ hizbsAndPages: { kind: "bounded", hizbs: 3, pages: { greaterThan: 16, lessThan: 18 }, dataStatus: "x" }, hizbEquivalent: approx(5) }, 286, bounded(47, 48)) }),
            item("h2", { type: "REVISION", description: "من سورة الصافات إلى سورة الناس", assignment: a(37, 114, 6), workload: snap({ hizbEquivalent: approx(16) }, 2448, { kind: "exact", value: 159, touched: 159, dataStatus: "x" }) }),
            item("h3", { type: "EXAM", description: "من سورة النبأ إلى سورة الناس", assignment: a(78, 114, 6), workload: snap({ hizbEquivalent: { kind: "exact", hizbs: 2 } }, 564, { kind: "exact", value: 23, touched: 23, dataStatus: "x" }) }),
            item("h4", { type: "EXAM", description: "سورة الملك", assignment: a(67, 67, 30), workload: snap({ hizbEquivalent: approx(0.5) }, 30, bounded(2, 3)) }),
          ],
        }),
    })
    renderIn(<WorkProgramDetails programId="p1" />)
    expect((await screen.findByText("5 أحزاب تقريبًا")).dataset.precision).toBe("approximate")
    expect(screen.queryByText(/16 و18 صفحة|286 آية/)).toBeNull() // no breakdown, no verse count from 100
    expect(screen.getByText("16 حزبًا تقريبًا").dataset.precision).toBe("approximate")
    const hint = screen.getByText("159 صفحة")
    expect(hint.dataset.hint).toBe("pages")
    expect(hint.getAttribute("aria-label")).toBe("مجموع الصفحات: 159 صفحة")
    expect(screen.getByText("حزبان").dataset.precision).toBe("exact")
    expect(screen.getByText("23 صفحة").dataset.hint).toBe("pages")
    expect(screen.getByText("30 آية")).toBeTruthy()
    expect(screen.getByText("بين صفحتين و3 صفحات").dataset.precision).toBe("bounded")
    expect(document.querySelectorAll("[data-hint]")).toHaveLength(2) // bounded pages are never a hint
    expect(screen.queryByText(/قيد التحقق/)).toBeNull()
    expect(document.body.textContent).not.toMatch(/undefined|NaN/)
  })
})


describe("«متابعة العمل» — «ترتيب حسب البرنامج» (web)", () => {
  const student = (id: string, firstName: string) => ({ id, firstName, lastName: "التونسي", photoUrl: null })
  const order = (group: number | null, reason: WorkloadOrder["reason"] = null): WorkloadOrder =>
    group === null
      ? { comparable: false, group: null, pages: null, examPages: null, reason }
      : { comparable: true, group, pages: { lo: 10, hi: 12, exact: false }, examPages: { lo: 0, hi: 0, exact: true }, reason: null }
  const base = [
    { ...program, id: "a", student: student("sa", "أمين") },
    { ...program, id: "b", student: student("sb", "بلال") },
    { ...program, id: "c", student: student("sc", "جميلة") },
    { ...program, id: "d", student: student("sd", "دينا") },
  ]
  // the server's advisory order: c (alone), then a ≈ d, then b not comparable (free text)
  const ordered: WorkProgram[] = [
    { ...base[2]!, workloadOrder: order(0) },
    { ...base[0]!, workloadOrder: order(1) },
    { ...base[3]!, workloadOrder: order(1) },
    { ...base[1]!, workloadOrder: order(null, "FREE_TEXT") },
  ]

  function stub() {
    const calls: URLSearchParams[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        const path = url.pathname.replace(/^\/api/, "")
        if (path === "/teacher/work-programs") {
          calls.push(url.searchParams)
          const data = url.searchParams.get("order") === "workload" ? ordered : base
          return json(200, { data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } })
        }
        if (path === "/teacher/work-programs/session-options") return json(200, [program.session])
        return json(404, { code: "NOT_FOUND", message: "غير موجود" })
      })
    )
    return calls
  }
  const names = () => [...document.querySelectorAll("li[data-program]")].map((li) => li.getAttribute("data-program"))
  async function chooseSession() {
    fireEvent.click(screen.getByRole("combobox", { name: /^الحصة/ }))
    fireEvent.click(await screen.findByRole("option", { name: new RegExp(program.session.groupName) }))
  }

  it("off by default; needs a session; on request the server's order with its groups, then back to the original order", async () => {
    const calls = stub()
    renderIn(<WorkFollowupScreen />)
    await screen.findByRole("link", { name: /برنامج عمل أمين/ })
    expect(names()).toEqual(["a", "b", "c", "d"])
    const original = screen.getByRole("radio", { name: WORKLOAD_ORDER.original })
    const byWork = screen.getByRole("radio", { name: WORKLOAD_ORDER.workload })
    expect(original.getAttribute("aria-checked")).toBe("true")
    expect(byWork).toHaveProperty("disabled", true)
    expect(screen.getByText(WORKLOAD_ORDER.needsSession)).toBeTruthy()
    expect(calls.every((c) => !c.has("order"))).toBe(true)

    await chooseSession()
    await waitFor(() => expect(calls.at(-1)!.get("sessionId")).toBe(program.session.id))
    fireEvent.click(screen.getByRole("radio", { name: WORKLOAD_ORDER.workload }))
    await waitFor(() => expect(names()).toEqual(["c", "a", "d", "b"]))
    expect([calls.at(-1)!.get("order"), calls.at(-1)!.get("sessionId"), calls.at(-1)!.get("page")]).toEqual(["workload", program.session.id, "1"])
    expect(screen.getByRole("status").textContent).toContain(WORKLOAD_ORDER.active)
    // groups: a ≈ d labelled comparable; b apart, never "last" as less; no rank numbers
    const sections = [...document.querySelectorAll("[data-section]")].map((s) => [s.getAttribute("data-section"), s.textContent])
    expect(sections).toEqual([
      ["group", WORKLOAD_ORDER.comparable],
      ["unavailable", `${WORKLOAD_ORDER.unavailable} — ${WORKLOAD_ORDER.unavailableHint}`],
    ])
    expect(document.body.textContent).not.toMatch(/الأول|الثاني|الثالث|رتبة/)
    // one session chosen: its phase («سابقة») is not repeated in every row (the full date stays)
    expect(screen.getByRole("link", { name: /برنامج عمل جميلة/ }).closest("li")!.textContent).not.toContain("سابقة")

    // the choice holds when the list is reloaded (another filter)
    fireEvent.click(screen.getByRole("tab", { name: "الحصص السابقة" }))
    await waitFor(() => expect(calls.at(-1)!.get("period")).toBe("past"))
    expect(calls.at(-1)!.get("order")).toBe("workload")

    fireEvent.click(screen.getByRole("radio", { name: WORKLOAD_ORDER.original }))
    await waitFor(() => expect(names()).toEqual(["a", "b", "c", "d"]))
    expect(calls.at(-1)!.has("order")).toBe(false)
    expect(document.querySelectorAll("[data-section]")).toHaveLength(0)
  })

  it("another session is never reordered without being asked", async () => {
    const calls = stub()
    renderIn(<WorkFollowupScreen />)
    await screen.findByRole("link", { name: /برنامج عمل أمين/ })
    await chooseSession()
    fireEvent.click(await screen.findByRole("radio", { name: WORKLOAD_ORDER.workload }))
    await waitFor(() => expect(calls.at(-1)!.get("order")).toBe("workload"))
    fireEvent.click(screen.getByRole("combobox", { name: /^الحصة/ }))
    fireEvent.click(await screen.findByRole("option", { name: "كل الحصص" }))
    await waitFor(() => expect(calls.at(-1)!.has("sessionId")).toBe(false))
    expect(calls.at(-1)!.has("order")).toBe(false)
    expect(screen.getByRole("radio", { name: WORKLOAD_ORDER.original }).getAttribute("aria-checked")).toBe("true")
  })
})

describe("«متابعة العمل» — «التقييم العام» (web)", () => {
  const given = (level: "EXCELLENT" | "VERY_GOOD" | "GOOD" | "NEEDS_IMPROVEMENT") => ({ level, evaluatedAt: "2026-10-19T17:00:00Z", evaluatedBy: "مريم بن علي" })
  const radios = () => within(screen.getByRole("radiogroup", { name: OVERALL_EVALUATION.title })).getAllByRole("radio")

  function stub(initial: WorkProgram, answer: (body: Record<string, unknown>) => Response | Promise<Response>) {
    let current = initial
    const calls: { method: string; path: string; body?: Record<string, unknown> }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace(/^\/api/, "")
        const method = init?.method ?? "GET"
        const body = init?.body ? JSON.parse(String(init.body)) : undefined
        calls.push({ method, path, body })
        if (path === "/teacher/work-programs/p1/evaluation") {
          const res = await answer(body)
          if (res.ok) current = (await res.clone().json()) as WorkProgram
          return res
        }
        if (path === "/teacher/work-programs/p1") return json(200, current)
        if (path === "/teacher/work-programs") return json(200, { data: [current], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } })
        if (path === "/teacher/work-programs/session-options") return json(200, [current.session])
        return json(404, { code: "NOT_FOUND", message: "غير موجود" })
      })
    )
    return calls
  }

  it("not given yet: four choices, none selected, the empty state and the pending-items note (never blocking)", async () => {
    stub(program, () => json(200, program))
    renderIn(<WorkProgramDetails programId="p1" />)
    expect(await screen.findByRole("heading", { name: OVERALL_EVALUATION.title })).toBeTruthy()
    expect(radios().map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual(WORK_PERFORMANCES.map((l) => [PERFORMANCE_LABEL[l], "false"]))
    expect(screen.getByText(OVERALL_EVALUATION.none)).toBeTruthy()
    expect(screen.getByText(overallPendingNote(program.progress.pending)!)).toBeTruthy()
    expect(radios().every((r) => !(r as HTMLButtonElement).disabled)).toBe(true)
    // only one set of evaluation controls for the overall evaluation
    expect(screen.getAllByRole("radiogroup", { name: OVERALL_EVALUATION.title })).toHaveLength(1)
  })

  it("choose → save → shown only once the server confirms (with its version); then a correction, worded explicitly", async () => {
    let release: (r: Response) => void = () => {}
    const calls = stub(program, (body) =>
      body.overall === "VERY_GOOD"
        ? new Promise<Response>((resolve) => (release = resolve))
        : json(200, { ...program, version: 5, overallEvaluation: given("EXCELLENT") })
    )
    renderIn(<WorkProgramDetails programId="p1" />)
    await screen.findByRole("heading", { name: OVERALL_EVALUATION.title })
    fireEvent.click(screen.getByRole("radio", { name: "جيد جدًا" }))
    expect(screen.getByRole("radio", { name: "جيد جدًا" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: OVERALL_EVALUATION.save }))
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true))
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ version: program.version, overall: "VERY_GOOD", items: [] })
    // not claimed before the server answers
    expect(document.querySelector("[data-overall-saved]")!.getAttribute("data-overall-saved")).toBe("")
    release(json(200, { ...program, version: 4, overallEvaluation: given("VERY_GOOD") }))
    await waitFor(() => expect(document.querySelector("[data-overall-saved]")!.getAttribute("data-overall-saved")).toBe("VERY_GOOD"))
    expect(screen.queryByRole("button", { name: OVERALL_EVALUATION.save })).toBeNull()
    expect(screen.queryByRole("radio")).toBeNull() // the choices close once saved
    expect(screen.getByText("آخر تقييم: مريم بن علي · 19 أكتوبر 2026")).toBeTruthy()

    // correction: behind «تعديل التقييم»
    fireEvent.click(screen.getByRole("button", { name: "تعديل التقييم" }))
    expect(screen.getByRole("radio", { name: "جيد جدًا" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("radio", { name: "ممتاز" }))
    expect(screen.getByText(overallChangeText("VERY_GOOD", "EXCELLENT"))).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: OVERALL_EVALUATION.save }))
    await waitFor(() => expect(document.querySelector("[data-overall-saved]")!.getAttribute("data-overall-saved")).toBe("EXCELLENT"))
    expect(calls.filter((c) => c.method === "PATCH").at(-1)!.body).toEqual({ version: 4, overall: "EXCELLENT", items: [] })
  })

  it("a stale version (409): the server's message, the program reloaded, nothing shown as saved", async () => {
    const message = "تغيّر برنامج العمل منذ فتحه. أعد التحميل."
    const calls = stub({ ...program, overallEvaluation: given("GOOD") }, () => json(409, { code: "WORK_PROGRAM_CHANGED", message }))
    renderIn(<WorkProgramDetails programId="p1" />)
    fireEvent.click(await screen.findByRole("button", { name: "تعديل التقييم" }))
    fireEvent.click(screen.getByRole("radio", { name: "ممتاز" }))
    const gets = () => calls.filter((c) => c.method === "GET" && c.path === "/teacher/work-programs/p1").length
    const before = gets()
    fireEvent.click(screen.getByRole("button", { name: OVERALL_EVALUATION.save }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain(message)
    await waitFor(() => expect(gets()).toBeGreaterThan(before))
    expect(document.querySelector("[data-overall-saved]")!.getAttribute("data-overall-saved")).toBe("GOOD")
  })

  it("before the session starts or once cancelled: choices disabled with the reason; a recorded value stays visible", async () => {
    const upcoming = { ...program, session: session("ses1", "2099-10-19"), evaluation: { allowed: false, blockedReason: "SESSION_NOT_STARTED" as const } }
    stub(upcoming, () => json(200, upcoming))
    const { unmount } = renderIn(<WorkProgramDetails programId="p1" />)
    await screen.findByRole("heading", { name: OVERALL_EVALUATION.title })
    expect(radios().every((r) => (r as HTMLButtonElement).disabled)).toBe(true)
    expect(document.querySelector("[data-overall-blocked]")!.textContent).toBe(OVERALL_BLOCKED.notStarted)
    unmount()
    const cancelled = { ...upcoming, session: { ...upcoming.session, status: "CANCELLED" as const }, evaluation: { allowed: false, blockedReason: "SESSION_CANCELLED" as const }, overallEvaluation: given("GOOD") }
    stub(cancelled, () => json(200, cancelled))
    renderIn(<WorkProgramDetails programId="p1" />)
    await screen.findByRole("heading", { name: OVERALL_EVALUATION.title })
    expect(document.querySelector("[data-overall-saved]")!.getAttribute("data-overall-saved")).toBe("GOOD")
    // a recorded level cannot be corrected while closed: no «تعديل التقييم», no choices
    expect(screen.queryByRole("button", { name: "تعديل التقييم" })).toBeNull()
    expect(screen.queryByRole("radio")).toBeNull()
    expect(document.querySelector("[data-overall-blocked]")!.textContent).toBe(OVERALL_BLOCKED.cancelled)
  })

  it("compact row: the level only («جيد جدًا», no «التقييم العام:») once given, next to the items' own results (never instead of them)", async () => {
    stub({ ...program, overallEvaluation: given("VERY_GOOD") }, () => json(200, program))
    renderIn(<WorkFollowupScreen />)
    const link = await screen.findByRole("link", { name: /برنامج عمل درة نصير/ })
    const row = link.closest("li[data-program]") as HTMLElement
    expect(row.querySelector("[data-overall]")!.textContent).toBe("جيد جدًا")
    expect(row.textContent).not.toContain("التقييم العام:")
    expect(row.querySelectorAll("[data-result]").length).toBeGreaterThan(0)
  })

  it("compact row without an overall evaluation: no extra line", async () => {
    stub(program, () => json(200, program))
    renderIn(<WorkFollowupScreen />)
    const row = (await screen.findByRole("link", { name: /برنامج عمل درة نصير/ })).closest("li[data-program]") as HTMLElement
    expect(row.querySelector("[data-overall]")).toBeNull()
    expect(within(row).queryByText(OVERALL_EVALUATION.none)).toBeNull()
  })
})

describe("«تفاصيل برنامج العمل» (web, the mobile redesign)", () => {
  const counters = () => [...document.querySelectorAll("[data-summary]")].map((c) => [...c.children].map((x) => x.textContent).join(" "))
  const withItems = (items: WorkItem[], extra: Partial<WorkProgram> = {}) => routeFetch({ get: () => json(200, { ...program, items, ...extra }) })

  it("«ملخص الأعمال» counts EVERY item: 1 منجز · 1 ملغى — never «جميع الأعمال», no progress bar; the level in the summary", async () => {
    withItems([item("a", { status: "COMPLETED" }), item("b", { status: "CANCELLED" })], {
      overallEvaluation: { level: "GOOD", evaluatedAt: "2026-10-19T17:00:00Z", evaluatedBy: "مريم بن علي" },
    })
    renderIn(<WorkProgramDetails programId="p1" />)
    await screen.findByRole("heading", { name: "ملخص الأعمال" })
    expect(counters()).toEqual(["1 منجز", "1 ملغى"])
    expect(screen.getByRole("list", { name: "ملخص الأعمال: 1 منجز · 1 ملغى" })).toBeTruthy()
    expect(screen.getByText("عملان")).toBeTruthy()
    expect(document.querySelector("[data-summary-overall]")!.textContent).toBe("جيد")
    expect(document.body.textContent).not.toMatch(/جميع الأعمال/)
    expect(screen.queryByRole("progressbar")).toBeNull()
  })

  it("other mixes: 2 منجزان; 1 منجز · 4 ملغاة", async () => {
    withItems([item("a", { status: "COMPLETED" }), item("b", { status: "COMPLETED" })])
    const first = renderIn(<WorkProgramDetails programId="p1" />)
    await screen.findByRole("heading", { name: "ملخص الأعمال" })
    expect(counters()).toEqual(["2 منجزان"])
    first.unmount()
    withItems([item("a", { status: "COMPLETED" }), ...[1, 2, 3, 4].map((n) => item(`c${n}`, { status: "CANCELLED" }))])
    renderIn(<WorkProgramDetails programId="p1" />)
    await screen.findByRole("heading", { name: "ملخص الأعمال" })
    expect(counters()).toEqual(["1 منجز", "4 ملغاة"])
  })

  it("each item keeps its details; the next recitation is a link; «إضافة العرضة التالية» is GREEN (primary), purple only on the عرضة badge", async () => {
    withItems([
      item("r1", {
        type: "RECITATION",
        recitationNumber: 1,
        description: "العرضة الأولى من سورة المجادلة",
        status: "CANCELLED",
        evaluatedBy: "حمدي الشوك",
        evaluatedAt: "2026-10-19T17:00:00Z",
        evaluationComment: "غاب عن الحصة",
        recitation: { surah: 58, attempts: 1 },
        continuedBy: [{ itemId: "r2", programId: "p2", sessionId: "ses2", sessionDate: "2026-10-26" }],
      }),
    ])
    renderIn(<WorkProgramDetails programId="p1" />)
    const card = (await screen.findByText("ملاحظات التقييم")).closest("li")!
    const type = card.querySelector("[data-type='RECITATION']")!
    expect(type.className).toMatch(/violet/)
    expect(type.textContent).toBe("عرضة1")
    expect(card.querySelector("[data-status='CANCELLED']")!.className).not.toMatch(/violet/)
    expect(within(card).getByText("غاب عن الحصة")).toBeTruthy()
    expect(card.querySelector("[data-evaluated]")!.textContent).toContain("حمدي الشوك")
    expect(card.querySelector("[data-recitation-count]")!.textContent).toBe("عرضة واحدة")
    const next = within(card).getByRole("link", { name: /^العرضة التالية مبرمجة في حصة/ })
    expect(next.getAttribute("href")).toBe("/teacher/work-followup/p2")
    expect(within(next).getByText("العرضة القادمة")).toBeTruthy()
    const add = within(card).getByRole("button", { name: "إضافة العرضة التالية" })
    expect(add.getAttribute("data-variant")).toBe("default")
    expect(add.className).not.toMatch(/violet/)
    expect(within(card).getByRole("button", { name: "نقل إلى الحصة القادمة" }).getAttribute("data-variant")).toBe("outline")
    expect(document.body.textContent).not.toMatch(/دورة|تحتسب|من 4/)
  })
})
