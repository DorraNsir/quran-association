import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { RecitationAttempt, RecitationHistory } from "@/types/work-followup"

import { RecitationLine, recitationsHref } from "./recitation-line"
import { StudentRecitations } from "./student-recitations"

let seq = 0
const entry = (number: number | null, e: RecitationAttempt["entry"], status: RecitationAttempt["status"]): RecitationAttempt => {
  seq++
  return {
    itemId: `i${seq}`,
    programId: `p${seq}`,
    sessionId: `s${seq}`,
    sessionDate: `2026-11-${String(seq).padStart(2, "0")}`,
    number,
    entry: e,
    status,
    evaluationComment: null,
    evaluatedAt: null,
    evaluatedBy: e === "PENDING" ? null : "المعلم",
  }
}

// al-Mujadila: 1 ملغاة, 2 مؤجلة (rescheduled with its number), 2 منجزة, 3 جزئي → next 4
const mujadila = {
  surah: 58,
  attempts: 3,
  nextNumber: 4,
  entries: [entry(1, "CANCELLED", "CANCELLED"), entry(2, "POSTPONED", "POSTPONED"), entry(2, "COMPLETED", "COMPLETED"), entry(3, "PARTIAL", "PARTIAL")],
}
// many recitations, no limit
const baqara = {
  surah: 2,
  attempts: 6,
  nextNumber: 8,
  entries: [1, 2, 3, 4, 5, 6].map((n) => entry(n, "COMPLETED", "COMPLETED")).concat(entry(7, "PENDING", "NOT_EVALUATED")),
}
const history: RecitationHistory = { studentId: "st1", surahs: [baqara, mujadila] }

function routeFetch(body: RecitationHistory = history) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/api/, "")
      if (path === "/teacher/students/st1/recitations") return json(200, body)
      return json(404, { code: "NOT_FOUND", message: "غير موجود" })
    })
  )
}
const renderIn = (ui: React.ReactNode) => renderWithClient(<DirectionProvider dir="rtl">{ui}</DirectionProvider>)
const cards = () => [...document.querySelectorAll("[data-entry]")].map((c) => c.querySelector(".font-medium")?.textContent)

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["TEACHER"]))
})

describe("«متابعة العرضات» — student profile (web)", () => {
  it("one row per surah with how many recitations were done; the opened surah lists them in order with their results", async () => {
    routeFetch()
    renderIn(<StudentRecitations studentId="st1" initialSurah={58} />)
    expect(await screen.findByRole("list", { name: "متابعة العرضات" })).toBeTruthy()
    expect(screen.getByText("6 عرضات")).toBeTruthy()
    expect(screen.getByText("3 عرضات")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "سورة المجادلة — متابعة العرضات" })).toBeTruthy()
    expect(cards()).toEqual(["العرضة 1 — ملغاة", "العرضة 2 — مؤجلة · لا تحتسب", "العرضة 2 — منجزة", "العرضة 3 — جزئي"])
    expect(screen.getByText("التالية: العرضة 4")).toBeTruthy()
    // minimal wording: «لا تحتسب» only on the postponed one; no cycles, targets or «محتسبة»
    expect(document.body.textContent!.match(/لا تحتسب/g)).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/دورة|محتسب|من 4|بدء/)
  })

  it("more than five recitations, and a pending one, in another surah", async () => {
    routeFetch()
    renderIn(<StudentRecitations studentId="st1" />)
    fireEvent.click(await screen.findByRole("button", { name: /سورة البقرة/ }))
    expect(cards()).toHaveLength(7)
    expect(cards().at(-1)).toBe("العرضة 7 — لم تُقيَّم بعد")
    expect(screen.getByText("التالية: العرضة 8")).toBeTruthy()
  })

  it("no recitation yet: an empty state", async () => {
    routeFetch({ studentId: "st1", surahs: [] })
    renderIn(<StudentRecitations studentId="st1" />)
    expect(await screen.findByText("لا توجد عرضات بعد")).toBeTruthy()
  })

  it("Work Program item: «سورة المجادلة · 3 عرضات» and a link to the surah's history (no link in list rows)", () => {
    const { unmount } = renderIn(<RecitationLine recitation={{ surah: 58, attempts: 3 }} studentId="st1" />)
    expect(screen.getByText("سورة المجادلة · 3 عرضات")).toBeTruthy()
    expect(screen.getByRole("link", { name: "سجل العرضات" }).getAttribute("href")).toBe(recitationsHref("st1", 58))
    unmount()
    renderIn(<RecitationLine recitation={{ surah: 58, attempts: 0 }} studentId="st1" compact />)
    expect(screen.getByText("سورة المجادلة · لا عرضات بعد")).toBeTruthy()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
