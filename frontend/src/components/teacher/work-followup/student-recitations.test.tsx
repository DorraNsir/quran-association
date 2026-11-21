import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { RecitationAttempt, RecitationHistory } from "@/types/work-followup"

import { RecitationCycleLine, recitationsHref } from "./recitation-cycle-line"
import { StudentRecitations } from "./student-recitations"

const attempt = (n: number | null, entry: RecitationAttempt["entry"], status: RecitationAttempt["status"], day: number): RecitationAttempt => ({
  itemId: `i${day}`,
  programId: `p${day}`,
  sessionId: `s${day}`,
  sessionDate: `2026-11-${String(day).padStart(2, "0")}`,
  attemptNumber: n,
  entry,
  status,
  evaluationComment: null,
  evaluatedAt: null,
  evaluatedBy: entry === "PENDING" ? null : "المعلم",
})

const baqara = {
  surah: 2,
  cycles: [
    {
      id: "c1",
      number: 1,
      successes: 3,
      required: 4,
      attempts: 5,
      completed: false,
      completedAt: null,
      startedAt: "2026-11-01T10:00:00Z",
      entries: [
        attempt(1, "SUCCESS", "COMPLETED", 1),
        attempt(2, "SUCCESS", "COMPLETED", 3),
        attempt(3, "FAILED", "NOT_COMPLETED", 5),
        attempt(null, "POSTPONED", "POSTPONED", 6),
        attempt(4, "SUCCESS", "COMPLETED", 8),
        attempt(5, "PENDING", "NOT_EVALUATED", 10),
      ],
    },
  ],
  earlier: [],
  canStartNewCycle: false,
}
const nasr = {
  surah: 110,
  cycles: [
    {
      id: "c2",
      number: 1,
      successes: 4,
      required: 4,
      attempts: 4,
      completed: true,
      completedAt: "2026-11-12T10:00:00Z",
      startedAt: "2026-11-01T10:00:00Z",
      entries: [1, 2, 3, 4].map((n) => attempt(n, "SUCCESS", "COMPLETED", 10 + n)),
    },
  ],
  earlier: [attempt(null, "SUCCESS", "COMPLETED", 2)],
  canStartNewCycle: true,
}
const history: RecitationHistory = { studentId: "st1", surahs: [baqara, nasr] }

function routeFetch(body: RecitationHistory = history) {
  const calls: { method: string; path: string }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? "GET"
      const path = url.pathname.replace(/^\/api/, "")
      calls.push({ method, path })
      if (path === "/teacher/students/st1/recitations" && method === "GET") return json(200, body)
      if (path === "/teacher/students/st1/recitations/110/cycles" && method === "POST") return json(201, body)
      return json(404, { code: "NOT_FOUND", message: "غير موجود" })
    })
  )
  return calls
}
const renderIn = (ui: React.ReactNode) => renderWithClient(<DirectionProvider dir="rtl">{ui}</DirectionProvider>)

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["TEACHER"]))
})

describe("«متابعة العرضات» — student profile (web)", () => {
  it("one row per surah with its current cycle; the opened surah shows its attempt cards with chronological numbers", async () => {
    routeFetch()
    renderIn(<StudentRecitations studentId="st1" initialSurah={2} />)
    const list = await screen.findByRole("list", { name: "متابعة العرضات" })
    expect(within(list).getByText("الدورة الأولى · 3/4 ناجحة")).toBeTruthy()
    expect(within(list).getByText("الدورة الأولى · 4/4 ناجحة · مكتملة")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "سورة البقرة — متابعة العرضات" })).toBeTruthy()
    expect(screen.getByText("3 من 4 ناجحة")).toBeTruthy()
    const meter = screen.getByRole("meter", { name: "الدورة الأولى: 3 من 4 ناجحة" })
    expect(meter.getAttribute("aria-valuenow")).toBe("3")
    const cards = [...document.querySelectorAll("[data-entry]")].map((c) => [c.getAttribute("data-entry"), c.querySelector(".font-medium")?.textContent])
    expect(cards).toEqual([
      ["SUCCESS", "عرضة 1 — ناجحة"],
      ["SUCCESS", "عرضة 2 — ناجحة"],
      ["FAILED", "عرضة 3 — غير ناجحة"],
      ["POSTPONED", "مؤجلة — لا تُحتسب"],
      ["SUCCESS", "عرضة 4 — ناجحة"],
      ["PENDING", "عرضة 5 — قيد الانتظار"],
    ])
    // incomplete: no new cycle can be started
    expect(screen.queryByRole("button", { name: "بدء دورة جديدة" })).toBeNull()
  })

  it("a complete cycle: its completion, earlier records apart, and an explicit «بدء دورة جديدة»", async () => {
    const calls = routeFetch()
    renderIn(<StudentRecitations studentId="st1" />)
    const row = await screen.findByRole("button", { name: /سورة النصر/ })
    expect(row.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(row)
    expect(row.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(/مكتملة — /)).toBeTruthy()
    expect(screen.getByText("عرضات سُجّلت قبل متابعة الدورات (لا تُحتسب)")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "بدء دورة جديدة" }))
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true))
    expect(calls.find((c) => c.method === "POST")!.path).toBe("/teacher/students/st1/recitations/110/cycles")
  })

  it("no recitation yet: an empty state, no table", async () => {
    routeFetch({ studentId: "st1", surahs: [] })
    renderIn(<StudentRecitations studentId="st1" />)
    expect(await screen.findByText("لا توجد عرضات بعد")).toBeTruthy()
  })

  it("Work Program item: the compact cycle line (server values) and a link to the surah's history", () => {
    const cycle = { cycleId: "c1", surah: 2, number: 1, successes: 3, required: 4, completed: false, attemptNumber: 5, entry: "PENDING" as const }
    const { unmount } = renderIn(<RecitationCycleLine cycle={cycle} studentId="st1" />)
    expect(screen.getByText("الدورة الأولى · 3/4 ناجحة")).toBeTruthy()
    expect(screen.getByRole("link", { name: "سجل العرضات" }).getAttribute("href")).toBe(recitationsHref("st1", 2))
    expect(recitationsHref("st1", 2)).toBe("/teacher/students/st1?tab=recitations&surah=2")
    unmount()
    renderIn(<RecitationCycleLine cycle={cycle} studentId="st1" compact />)
    expect(screen.queryByRole("link")).toBeNull() // list cards stay compact
  })
})
