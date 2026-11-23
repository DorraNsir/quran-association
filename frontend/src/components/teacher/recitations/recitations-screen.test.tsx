import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { WorkFollowupProvider } from "@/components/teacher/work-followup/work-followup-provider"
import { recitationsHref } from "@/components/teacher/work-followup/recitation-line"
import { clearSession, setSession } from "@/lib/api/session"
import { todayInTunis } from "@/lib/dates"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { RecitationAttempt, RecitationHistory } from "@/types/work-followup"

import { recitationsModuleHref, RecitationsScreen } from "./recitations-screen"

// The teacher's classes and students (GET /api/teacher/workspace): s1 has a photo, s2 has none
vi.mock("@/lib/api/workspace", () => ({
  useTeacherWorkspace: () => ({
    data: {
      lookups: {
        branches: [{ id: "b1", name: "فرع الرقوبة", address: "", status: "ACTIVE" }],
        rooms: [],
        groups: [
          { id: "g1", name: "مجموعة الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
          { id: "g2", name: "مجموعة النور", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
        ],
        groupClasses: [
          { id: "c1", groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
          { id: "c2", groupId: "g2", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
        ],
        teachers: [],
        schedules: [],
      },
      students: [
        { id: "s1", firstName: "درة", lastName: "نصير", groupClassId: "c1", status: "ACTIVE", photoUrl: null },
        { id: "s2", firstName: "منيرة", lastName: "مومو", groupClassId: "c2", status: "ACTIVE", photoUrl: null },
      ],
    },
  }),
}))

let seq = 0
const entry = (number: number | null, e: RecitationAttempt["entry"], status: RecitationAttempt["status"], date: string): RecitationAttempt => {
  seq++
  return {
    itemId: `i${seq}`,
    programId: `p${seq}`,
    sessionId: `ses${seq}`,
    sessionDate: date,
    number,
    entry: e,
    status,
    evaluationComment: null,
    evaluatedAt: null,
    evaluatedBy: null,
  }
}

// past sessions (2020), whatever today is — al-Mujadila: 1 ملغاة, 2 مؤجلة twice then 2 منجزة (one recitation), 3 جزئي, 4 pending → 3 عرضات
const mujadila = {
  surah: 58,
  attempts: 3,
  nextNumber: 5,
  entries: [
    entry(1, "CANCELLED", "CANCELLED", "2020-11-02"),
    entry(2, "POSTPONED", "POSTPONED", "2020-11-09"),
    entry(2, "POSTPONED", "POSTPONED", "2020-11-16"),
    entry(2, "COMPLETED", "COMPLETED", "2020-11-23"),
    entry(3, "PARTIAL", "PARTIAL", "2020-11-30"),
    entry(4, "PENDING", "NOT_EVALUATED", "2020-12-07"),
  ],
}
// many recitations, numbered on their own (another surah)
const baqara = {
  surah: 2,
  attempts: 9,
  nextNumber: 10,
  entries: Array.from({ length: 9 }, (_, i) => entry(i + 1, i % 3 === 0 ? "NOT_COMPLETED" : "COMPLETED", i % 3 === 0 ? "NOT_COMPLETED" : "COMPLETED", `2020-10-${String(i + 1).padStart(2, "0")}`)),
}
const history: RecitationHistory = { studentId: "s1", surahs: [baqara, mujadila] }

// my sessions of today (start times): «started» began at 00:00, «later» starts at 23:59
let sessionsToday: { id: string; date: string; startTime: string }[] = []

function routeFetch(answer: (studentId: string) => Response = (id) => json(200, id === "s1" ? history : { studentId: id, surahs: [] })) {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, "")
      calls.push(path)
      const m = /^\/teacher\/students\/([^/]+)\/recitations$/.exec(path)
      if (m) return answer(m[1]!)
      if (path === "/teacher/work-programs/eligible-sessions") return json(200, [])
      if (path === "/teacher/sessions/calendar") return json(200, sessionsToday)
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
const row = (surah: number) => document.querySelector<HTMLElement>(`tr[data-surah="${surah}"]`)
const cells = (surah: number) => [...row(surah)!.querySelectorAll<HTMLElement>("[data-cell]")]

Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

beforeEach(() => {
  sessionsToday = []
  clearSession()
  setSession(authResponse("u1", ["TEACHER"]))
})

describe("«متابعة العرضات» — the module (web)", () => {
  it("no student chosen: a prompt, nothing requested", () => {
    const calls = routeFetch()
    renderIn(<RecitationsScreen />)
    expect(screen.getByRole("heading", { name: "متابعة العرضات" })).toBeTruthy()
    expect(screen.getByText("اختر طالبًا")).toBeTruthy()
    expect(calls.some((c) => c.includes("/recitations"))).toBe(false)
  })

  it("a table: one row per surah, one column per numbered recitation; a postponed one and its continuation share the number", async () => {
    routeFetch()
    renderIn(<RecitationsScreen initialStudentId="s1" />)
    await screen.findByRole("table", { name: "عرضات درة نصير" })
    // surahs with recitations only (default), in Mushaf order
    expect([...document.querySelectorAll("tr[data-surah]")].map((r) => r.getAttribute("data-surah"))).toEqual(["2", "58"])
    // as many columns as the longest history (9), not one per session
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["السورة", "عدد العرضات", ...Array.from({ length: 9 }, (_, i) => `العرضة ${i + 1}`), "إضافة"])
    expect(row(58)!.querySelector("[data-attempts]")!.textContent).toBe("3")
    expect(cells(58).map((c) => c.getAttribute("data-cell"))).toEqual(["CANCELLED", "COMPLETED", "PARTIAL", "PENDING"])
    const second = cells(58)[1]!
    expect(second.getAttribute("aria-label")).toContain("سورة المجادلة — العرضة 2")
    expect(second.getAttribute("aria-label")).toContain("أُجّلت في: 9 ")
    // the postponements: ONE line under the recitation (as on mobile), never hidden
    const line = second.querySelectorAll("[data-postponed]")
    expect(line).toHaveLength(1)
    expect(line[0]!.textContent).toMatch(/^أُجّلت في: 9 .+ 2020، 16 .+ 2020$/)
    expect(document.querySelectorAll("[data-earlier]")).toHaveLength(0)
    expect(second.getAttribute("href")).toBe("/teacher/work-followup/p4")
    // no cycles, no targets, «لا تحتسب» never on a done recitation
    expect(document.body.textContent).not.toMatch(/دورة|محتسب|من 4/)
    expect(cells(2)).toHaveLength(9)
    // horizontal scrolling, the surah column kept in view
    expect(document.querySelector("[data-recitations-scroll]")!.className).toContain("overflow-x-auto")
    expect(row(58)!.querySelector("th")!.className).toContain("sticky")
  })

  it("totals: the server's attempts and one count per displayed recitation's result", async () => {
    routeFetch()
    renderIn(<RecitationsScreen initialStudentId="s1" />)
    await screen.findByRole("table")
    const totals = document.querySelector("[data-recitation-totals]")!
    expect(totals.textContent).toContain("12")
    expect(totals.querySelector("[data-total='COMPLETED']")!.textContent).toContain("7")
    expect(totals.querySelector("[data-total='PENDING']")!.textContent).toContain("1")
    // each postponement counted apart (like the mobile screen) — never in the recitations performed (12)
    expect(totals.querySelector("[data-total='POSTPONED']")!.textContent).toContain("2")
  })

  it("all 114 surahs on request; surah search; a result filter", async () => {
    routeFetch()
    renderIn(<RecitationsScreen initialStudentId="s1" />)
    await screen.findByRole("table")
    fireEvent.click(screen.getByRole("radio", { name: "كل السور" }))
    expect(document.querySelectorAll("tr[data-surah]")).toHaveLength(114)
    expect(row(114)!.querySelector("[data-attempts]")!.textContent).toBe("0")
    fireEvent.change(screen.getByRole("searchbox", { name: "البحث عن سورة" }), { target: { value: "المجادله" } })
    expect([...document.querySelectorAll("tr[data-surah]")].map((r) => r.getAttribute("data-surah"))).toEqual(["58"])
  })

  it("deep link («سجل العرضات»): the student chosen and the surah highlighted, even without history", async () => {
    routeFetch()
    expect(recitationsHref("s1", 58)).toBe(recitationsModuleHref("s1", 58))
    renderIn(<RecitationsScreen initialStudentId="s1" initialSurah={110} />)
    await screen.findByRole("table")
    expect(row(110)!.getAttribute("aria-current")).toBe("true")
  })

  it("«إضافة عرضة»: the Work Program form, the student chosen and a عرضة of that surah prefilled", async () => {
    routeFetch()
    renderIn(<RecitationsScreen initialStudentId="s1" />)
    await screen.findByRole("table")
    fireEvent.click(screen.getByRole("button", { name: "إضافة عرضة — سورة المجادلة" }))
    const sheet = await screen.findByRole("dialog")
    expect(within(sheet).getByRole("combobox", { name: /الطالب/ }).textContent).toContain("درة نصير")
    expect(within(sheet).getByRole("combobox", { name: "نوع العمل" }).textContent).toContain("عرضة")
    expect(within(sheet).getByText(/المجادلة/)).toBeTruthy()
  })

  it("another student (no photo, no history): the first letter and an empty state", async () => {
    routeFetch()
    renderIn(<RecitationsScreen initialStudentId="s2" />)
    expect(await screen.findByText("لا توجد عرضات بعد")).toBeTruthy()
    expect(screen.getAllByText("م").length).toBeGreaterThan(0)
  })

  it("an error (e.g. 403, a student outside my classes): the error state", async () => {
    routeFetch(() => json(403, { code: "FORBIDDEN", message: "لا يمكنك عرض هذا الطالب" }))
    renderIn(<RecitationsScreen initialStudentId="s1" />)
    await waitFor(() => expect(screen.getByText("لا يمكنك عرض هذا الطالب")).toBeTruthy())
  })

  it("«مجدولة» (session not started: calendar icon, neutral) vs «بانتظار التقييم» (started or past, unevaluated); results unchanged", async () => {
    const today = todayInTunis()
    sessionsToday = [
      { id: "started", date: today, startTime: "00:00" },
      { id: "later", date: today, startTime: "23:59" },
    ]
    const nas = {
      surah: 114,
      attempts: 2,
      nextNumber: 7,
      entries: [
        entry(1, "COMPLETED", "COMPLETED", "2020-11-02"),
        entry(2, "NOT_COMPLETED", "NOT_COMPLETED", "2020-11-09"),
        entry(3, "PENDING", "NOT_EVALUATED", "2020-11-16"), // past, not evaluated
        { ...entry(4, "PENDING", "NOT_EVALUATED", today), sessionId: "started" },
        { ...entry(5, "PENDING", "NOT_EVALUATED", today), sessionId: "later" },
        entry(6, "PENDING", "NOT_EVALUATED", "2099-01-04"), // a future session
      ],
    }
    const calls = routeFetch((id) => json(200, id === "s1" ? { studentId: "s1", surahs: [nas] } : { studentId: id, surahs: [] }))
    renderIn(<RecitationsScreen initialStudentId="s1" />)
    await screen.findByRole("table")
    // today's start times: my sessions of today, asked only because a recitation is dated today
    await waitFor(() => expect(cells(114).map((c) => c.getAttribute("data-cell"))).toEqual(["COMPLETED", "NOT_COMPLETED", "PENDING", "PENDING", "SCHEDULED", "SCHEDULED"]))
    expect(calls.filter((c) => c === "/teacher/sessions/calendar")).toHaveLength(1)
    const planned = cells(114)[5]!
    expect(planned.getAttribute("aria-label")).toContain("العرضة 6 · مجدولة")
    expect(planned.querySelector("span")!.className).toContain("bg-secondary")
    expect(cells(114)[2]!.textContent).toContain("بانتظار التقييم")
    const totals = document.querySelector("[data-recitation-totals]")!
    expect(totals.querySelector("[data-total='SCHEDULED']")!.textContent).toContain("2")
    expect(totals.querySelector("[data-total='SCHEDULED']")!.textContent).toContain("مجدولة")
    expect(totals.querySelector("[data-total='PENDING']")!.textContent).toContain("2")
    expect(totals.querySelector("[data-total='COMPLETED']")!.textContent).toContain("1")
    expect(totals.querySelector("[data-total='NOT_COMPLETED']")!.textContent).toContain("1")
    expect(totals.firstElementChild!.textContent).toContain("2") // the attempts: unchanged
  })

  it("no recitation dated today: today's sessions are not requested", async () => {
    const calls = routeFetch()
    renderIn(<RecitationsScreen initialStudentId="s1" />)
    await screen.findByRole("table")
    expect(calls.includes("/teacher/sessions/calendar")).toBe(false)
  })
})
