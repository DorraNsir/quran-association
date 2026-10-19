import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AttendanceTaker } from "@/components/attendance/attendance-taker"
import { SessionMemorizationPanel } from "@/components/sessions/session-memorization"
import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { toSessionRow, type SessionDto, type SessionRosterDto } from "@/lib/api/sessions"
import { todayInTunis } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { WeeklySchedule } from "@/types/domain"

import { ScheduleFormSheet } from "./schedule-form-sheet"
import { ExtraSessionSheet } from "./scheduling-actions"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
// The pages run inside the auth provider; here: a teacher's list of years (the current one — none)
vi.mock("@/lib/store/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/settings")>()),
  useAcademicYears: () => [],
}))

// jsdom lacks what Radix / cmdk call
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/**
 * «الحصص المشتركة» (Stage 5). درة (t1) supervises A (أركان) and B (الماهر)
 * in the same branch; C has another supervisor; F is درة's class in ANOTHER
 * branch; I is inactive.
 */
const lookups: Lookups = {
  branches: [
    { id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" },
    { id: "b2", name: "فرع آخر", address: "تونس", status: "ACTIVE" },
  ],
  rooms: [
    { id: "r1", branchId: "b1", name: "القاعة 1", status: "ACTIVE" },
    { id: "r2", branchId: "b1", name: "القاعة 2", status: "ACTIVE" },
  ],
  groups: [
    { id: "g1", name: "أركان", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
    { id: "g2", name: "الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
    { id: "g3", name: "الثالثة", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
  ],
  groupClasses: [
    { id: "A", groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: ["a1"], status: "ACTIVE" },
    { id: "B", groupId: "g2", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
    { id: "C", groupId: "g3", branchId: "b1", supervisorId: "t2", assistantIds: [], status: "ACTIVE" },
    { id: "F", groupId: "g1", branchId: "b2", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
    { id: "I", groupId: "g3", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "INACTIVE" },
  ],
  teachers: [
    { id: "t1", firstName: "درة", lastName: "ن", phone: "", status: "ACTIVE", joinedAt: "2024-09-01" },
    { id: "a1", firstName: "أحمد", lastName: "م", phone: "", status: "ACTIVE", joinedAt: "2024-09-01" },
  ],
  // B's own lesson: Monday 10:00–11:00 in room 2
  schedules: [{ id: "sB", groupClassId: "B", day: "MON", start: "10:00", end: "11:00", roomId: "r2" }],
}

function routeFetch(handler: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const calls: { method: string; url: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const answer = handler(url, init)
      if (answer) return answer
      if (url.includes("/platform-preferences"))
        return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
      if (init?.method === "POST") return json(201, { id: "new", generation: null })
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return calls
}

const rtl = (ui: React.ReactNode) => renderWithClient(<DirectionProvider dir="rtl">{ui}</DirectionProvider>)

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("scheduling forms — «أقسام مشتركة»", () => {
  it("offers only the same supervisor's running classes of the same branch, and sends the chosen ones", async () => {
    const calls = routeFetch()
    rtl(<ExtraSessionSheet open onOpenChange={() => {}} lookups={lookups} preset={{ groupClassId: "A", roomId: "r1" }} />)
    const dialog = await screen.findByRole("dialog")
    const field = within(dialog).getByRole("group", { name: /أقسام مشتركة/ })
    // Only B: not C (other supervisor), F (other branch), I (inactive) or A itself
    expect(within(field).getAllByRole("checkbox")).toHaveLength(1)
    fireEvent.click(within(field).getByRole("checkbox", { name: /الماهر/ }))
    fireEvent.click(within(dialog).getByRole("button", { name: "برمجة الحصة الإضافية" }))
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true))
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({
      groupClassId: "A",
      additionalGroupClassIds: ["B"],
    })
  })

  it("a weekly slot with an additional class that already meets then shows the CLASS conflict and cannot be saved", async () => {
    routeFetch()
    const onSave = vi.fn()
    rtl(
      <ScheduleFormSheet
        open
        onOpenChange={() => {}}
        lookups={lookups}
        preset={{ groupClassId: "A", day: "MON", start: "09:00", end: "11:00", roomId: "r1" }}
        onSave={onSave}
      />
    )
    const dialog = await screen.findByRole("dialog")
    // درة already teaches B then (teacher conflict); adding B makes it a class conflict too
    expect(within(dialog).queryByText(/تداخل في حصص القسم/)).toBeNull()
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /الماهر/ }))
    expect(await within(dialog).findByText(/تداخل في حصص القسم/)).toBeTruthy()
    expect((within(dialog).getByRole("button", { name: "برمجة الموعد" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("editing a shared slot: the host is fixed (explained), an additional class can be removed", async () => {
    routeFetch()
    const onSave = vi.fn<(slot: WeeklySchedule) => Promise<void>>(async () => {})
    const shared: WeeklySchedule = {
      id: "s1",
      groupClassId: "A",
      additionalGroupClassIds: ["B"],
      day: "TUE",
      start: "09:00",
      end: "11:00",
      roomId: "r1",
    }
    rtl(<ScheduleFormSheet open onOpenChange={() => {}} lookups={lookups} schedule={shared} onSave={onSave} />)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/القسم الأساسي \(أركان\) ثابت/)).toBeTruthy()
    const box = within(dialog).getByRole("checkbox", { name: /الماهر/ })
    expect(box.getAttribute("data-state")).toBe("checked")
    fireEvent.click(box)
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعديلات" }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "s1", groupClassId: "A", additionalGroupClassIds: [] })
  })
})

const sharedSession: SessionDto = {
  id: "se1",
  date: "2026-10-14",
  startTime: "09:00",
  endTime: "11:00",
  status: "SCHEDULED",
  cancellationReason: null,
  weeklyScheduleId: "s1",
  isExtra: false,
  groupClass: { id: "A", status: "ACTIVE", group: { id: "g1", name: "أركان", status: "ACTIVE" } },
  additionalClasses: [{ id: "B", status: "ACTIVE", group: { id: "g2", name: "الماهر", status: "ACTIVE" } }],
  room: { id: "r1", name: "القاعة 1", status: "ACTIVE", branch: { id: "b1", name: "فرع المركز", status: "ACTIVE" } },
  teachers: [{ id: "t1", firstName: "درة", lastName: "ن", role: "SUPERVISOR", status: "ACTIVE" }],
  attendance: { expected: 3, recorded: 0, present: 0, absent: 0, late: 0, excused: 0 },
}

describe("shared lesson — attendance", () => {
  const student = (id: string, firstName: string, classId: string, group: string) => ({
    studentId: id,
    firstName,
    lastName: "التونسي",
    photoUrl: null,
    groupClass: { id: classId, group: { id: classId, name: group } },
    expected: true,
    recorded: false,
    status: null,
    note: null,
  })
  const roster = (over: Partial<SessionRosterDto> = {}): SessionRosterDto => ({
    sessionId: "se1",
    date: "2026-10-14",
    startTime: "09:00",
    endTime: "11:00",
    sessionStatus: "SCHEDULED",
    expectedCount: 3,
    recordedCount: 0,
    complete: false,
    editable: true,
    correctable: true,
    additionalClasses: [{ id: "B", group: { id: "g2", name: "الماهر" } }],
    scope: { allStudents: true, groupClassIds: ["A", "B"] },
    students: [student("s1", "أنس", "A", "أركان"), student("s2", "يوسف", "A", "أركان"), student("s3", "مريم", "B", "الماهر")],
    teacherExpectedCount: 0,
    teacherRecordedCount: 0,
    teachers: [],
    ...over,
  })
  const render = (r: SessionRosterDto) =>
    rtl(<AttendanceTaker row={toSessionRow(sharedSession, "2026-10-15")} roster={r} workspace="teacher" />)

  it("one combined list, each student with their own program; the lesson is titled with both programs", () => {
    routeFetch()
    render(roster())
    expect(screen.getAllByText("أركان + الماهر").length).toBeGreaterThan(0)
    const list = screen.getByRole("heading", { name: /حضور الطلبة/ }).closest("section")!
    expect(within(list).getAllByText("أركان")).toHaveLength(2)
    expect(within(list).getAllByText("الماهر")).toHaveLength(1)
    expect(screen.queryByText(/تظهر هنا طلبة أقسامك فقط/)).toBeNull()
  })

  it("an assistant of one class is told they only see their class's students", () => {
    routeFetch()
    render(
      roster({
        scope: { allStudents: false, groupClassIds: ["A"] },
        expectedCount: 2,
        students: [student("s1", "أنس", "A", "أركان"), student("s2", "يوسف", "A", "أركان")],
      })
    )
    expect(screen.getByText("حصة مشتركة: تظهر هنا طلبة أقسامك فقط")).toBeTruthy()
    expect(screen.getByText(/تسجّل حضور طلبة أركان/)).toBeTruthy()
  })
})

describe("shared lesson — «متابعة الحفظ» panel", () => {
  const memo = {
    sessionId: "se1",
    date: "2026-10-14",
    classes: [
      { id: "A", group: { id: "g1", name: "أركان" } },
      { id: "B", group: { id: "g2", name: "الماهر" } },
    ],
    scope: { allStudents: true, groupClassIds: ["A", "B"] },
    academicYear: { id: "y1", label: "2026–2027" },
    semester: "FIRST",
    period: { from: "2026-09-15", to: "2027-01-31" },
    students: [
      { studentId: "s1", firstName: "أنس", lastName: "ت", photoUrl: null, studentStatus: "ACTIVE", groupClass: { id: "A", group: { id: "g1", name: "أركان" } }, lastMemorizedSurahNumber: 2, surahName: "البقرة", updatedAt: null },
      { studentId: "s3", firstName: "مريم", lastName: "ت", photoUrl: null, studentStatus: "INACTIVE", groupClass: { id: "B", group: { id: "g2", name: "الماهر" } }, lastMemorizedSurahNumber: null, surahName: null, updatedAt: null },
    ],
  }

  it("lists every participating student with their program and value, and updates ONE student through the usual endpoint", async () => {
    setSession(authResponse("u1", ["TEACHER"]))
    const calls = routeFetch((url, init) => {
      if (url.includes("/teacher/sessions/se1/memorization")) return json(200, memo)
      if (init?.method === "PUT") return json(200, {})
    })
    rtl(<SessionMemorizationPanel row={toSessionRow(sharedSession, todayInTunis())} workspace="teacher" />)
    expect(await screen.findByText(/قائمة موحّدة لطلبة الحصة المشتركة/)).toBeTruthy()
    expect(screen.getByText("أركان")).toBeTruthy()
    expect(screen.getByText("الماهر")).toBeTruthy()
    expect(screen.getByText(/البقرة/)).toBeTruthy()
    // The inactive student is listed with their status (same rule as the class list)
    expect(screen.getByText("غير نشط")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "تحديث الحفظ: مريم ت" }))
    const dialog = await screen.findByRole("dialog")
    // The dialog shows the student's OWN program
    expect(within(dialog).getByText("الماهر")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("combobox"))
    fireEvent.click(await screen.findByRole("option", { name: /سورة الملك/ }))
    fireEvent.click(within(dialog).getByRole("button", { name: /حفظ/ }))
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true))
    const put = calls.find((c) => c.method === "PUT")!
    expect(put.url).toContain("/teacher/students/s3/memorization")
    expect(put.body).toEqual({ academicYearId: "y1", semester: "FIRST", lastMemorizedSurahNumber: 67 })
  })
})
