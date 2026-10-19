import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { TeacherAttendanceHistory } from "./teacher-attendance-history"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/lib/store/settings", () => {
  const year = {
    id: "y1", label: "2026-2027", isCurrent: true, startDate: "2026-09-01", endDate: "2027-06-30",
    semesters: { SEMESTER_1: { startDate: "2026-09-01", endDate: "2027-01-31" }, SEMESTER_2: { startDate: "2027-02-01", endDate: "2027-06-30" } },
  }
  return {
    useAcademicYears: () => [year],
    useCurrentAcademicYear: () => year,
    usePlatformSettings: () => ({ defaultPageSize: 10 }),
  }
})
// jsdom lacks what Radix Select calls when an option list opens
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}

/** درة: group 1 — 5 lessons, all attended; group 2 — 2 lessons, 1 attended; all — 6 / 7. */
const totals = (attended: number, eligible: number) => ({
  recorded: eligible, present: attended, late: 0, absent: eligible - attended, excused: 0,
  attended, eligible, rate: eligible ? Math.round((attended / eligible) * 1000) / 10 : null, from: null, to: null,
})
const BY_GROUP: Record<string, ReturnType<typeof totals>> = { all: totals(6, 7), g1: totals(5, 5), g2: totals(1, 2), g4: totals(0, 0) }
const record = (sessionId: string, group: string, extra: { id: string; group: { id: string; name: string } }[] = []) => ({
  sessionId, date: "2026-10-12", startTime: "10:00", endTime: "11:00", sessionStatus: "COMPLETED",
  groupClass: { id: `c-${group}`, group: { id: group, name: group === "g1" ? "الارقم" : "الماهر" } },
  additionalClasses: extra, role: "SUPERVISOR", status: "PRESENT", note: null, updatedAt: "2026-10-12T10:00:00Z",
})

function routeFetch() {
  const calls: URL[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      calls.push(url)
      const group = url.searchParams.get("groupId") ?? "all"
      if (url.pathname.endsWith("/attendance/groups"))
        return json(200, [{ id: "g1", name: "الارقم" }, { id: "g2", name: "الماهر" }, { id: "g4", name: "بدون حصص" }])
      if (url.pathname.endsWith("/attendance/summary")) return json(200, BY_GROUP[group])
      if (url.pathname.endsWith("/attendance")) {
        const rows = group === "g4" ? [] : group === "g2"
          ? [record("s-shared", "g1", [{ id: "c-g2", group: { id: "g2", name: "الماهر" } }])]
          : [record("s1", "g1"), record("s-shared", "g1", [{ id: "c-g2", group: { id: "g2", name: "الماهر" } }])]
        return json(200, { data: rows, meta: { page: 1, pageSize: 10, total: rows.length, totalPages: 1 } })
      }
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return calls
}

const render = (scope: "admin" | "teacher" = "admin") =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <TeacherAttendanceHistory scope={scope} teacherId={scope === "admin" ? "t1" : undefined} />
    </DirectionProvider>
  )
const cards = () => screen.getByRole("region", { name: "إحصائيات الحضور" })
const pick = async (name: string) => {
  fireEvent.click(screen.getByRole("combobox", { name: "المجموعة" }))
  fireEvent.click(await screen.findByRole("option", { name }))
}

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("teacher profile — attendance by group", () => {
  it("«جميع المجموعات» by default: global totals (6 / 7, 85.7 %)", async () => {
    const calls = routeFetch()
    render()
    expect((await screen.findByRole("combobox", { name: "المجموعة" })).textContent).toContain("جميع المجموعات")
    await waitFor(() => expect(within(cards()).getAllByText(/85\.7/).length).toBeGreaterThan(0))
    expect(calls.filter((u) => u.pathname.endsWith("/summary")).every((u) => !u.searchParams.has("groupId"))).toBe(true)
  })

  it("a group narrows the cards AND the history (the API filters before counting)", async () => {
    const calls = routeFetch()
    render()
    await screen.findAllByText(/85\.7/)
    await pick("الماهر")
    await waitFor(() => expect(within(cards()).getAllByText(/50/).length).toBeGreaterThan(0))
    const last = (suffix: string) => calls.filter((u) => u.pathname.endsWith(suffix)).at(-1)!
    expect(last("/summary").searchParams.get("groupId")).toBe("g2")
    expect(last("/attendance").searchParams.get("groupId")).toBe("g2")
    // Both cards (month and academic year) and the history follow the group
    const summaries = calls.filter((u) => u.pathname.endsWith("/summary") && u.searchParams.get("groupId") === "g2")
    expect(summaries.length).toBeGreaterThanOrEqual(2)
    // A shared lesson shows all of its programs
    expect(await screen.findByText(/الارقم \+ الماهر/)).toBeTruthy()
    await pick("الارقم")
    await waitFor(() => expect(within(cards()).getAllByText(/100/).length).toBeGreaterThan(0))
  })

  it("a group without lessons: empty totals and a group-specific empty state", async () => {
    routeFetch()
    render()
    await screen.findAllByText(/85\.7/)
    await pick("بدون حصص")
    expect(await screen.findByText("لا توجد سجلات حضور لهذه المجموعة في الفترة المختارة.")).toBeTruthy()
  })

  it("the teacher's own page has no group filter (unchanged)", async () => {
    setSession(authResponse("u1", ["TEACHER"]))
    const calls = routeFetch()
    render("teacher")
    await waitFor(() => expect(calls.some((u) => u.pathname.endsWith("/summary"))).toBe(true))
    expect(screen.queryByRole("combobox", { name: "المجموعة" })).toBeNull()
    expect(calls.some((u) => u.pathname.endsWith("/attendance/groups"))).toBe(false)
  })
})
