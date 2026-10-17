import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { toSessionRow, type SessionDto, type SessionRosterDto } from "@/lib/api/sessions"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { AttendanceTaker } from "./attendance-taker"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))

const session: SessionDto = {
  id: "se1",
  date: "2026-10-14",
  startTime: "17:00",
  endTime: "18:00",
  status: "SCHEDULED",
  cancellationReason: null,
  weeklyScheduleId: null,
  isExtra: false,
  groupClass: { id: "c1", status: "ACTIVE", group: { id: "g1", name: "مجموعة الماهر", status: "ACTIVE" } },
  room: { id: "r1", name: "القاعة 1", status: "ACTIVE", branch: { id: "b1", name: "فرع المركز", status: "ACTIVE" } },
  teachers: [],
  attendance: { expected: 2, recorded: 1, present: 1, absent: 0, late: 0, excused: 0 },
}
const student = (id: string, firstName: string, status: SessionRosterDto["students"][number]["status"]) => ({
  studentId: id, firstName, lastName: "التونسي", photoUrl: null, expected: true, recorded: status !== null, status, note: null,
})
const teacher = (id: string, firstName: string, role: "SUPERVISOR" | "ASSISTANT", status: SessionRosterDto["teachers"][number]["status"]) => ({
  teacherId: id, firstName, lastName: "المؤدب", photoUrl: null, role, recorded: status !== null, status, note: null,
})
const roster: SessionRosterDto = {
  sessionId: "se1", date: "2026-10-14", startTime: "17:00", endTime: "18:00", sessionStatus: "SCHEDULED",
  expectedCount: 2, recordedCount: 1, complete: false, editable: true, correctable: true,
  students: [student("s1", "أنس", "PRESENT"), student("s2", "يوسف", null)],
  teacherExpectedCount: 2, teacherRecordedCount: 1,
  teachers: [teacher("t1", "مريم", "SUPERVISOR", "PRESENT"), teacher("t2", "سلمى", "ASSISTANT", null)],
}

/** Records every PUT body; answers the save with `saveResponse`. */
function routeFetch(saveResponse: () => Response) {
  const puts: unknown[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "PUT" && url.includes("/sessions/se1/attendance")) {
        puts.push(JSON.parse(String(init.body)))
        return saveResponse()
      }
      if (url.includes("/platform-preferences"))
        return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return puts
}

const renderTaker = (r: SessionRosterDto = roster) =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <AttendanceTaker row={toSessionRow(session, "2026-10-15")} roster={r} workspace="teacher" />
    </DirectionProvider>
  )

const section = (name: string) => screen.getByRole("heading", { name: new RegExp(name) }).closest("section")!

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["TEACHER"]))
  push.mockReset()
})

describe("session attendance page — teachers and students, one save", () => {
  it("shows the teachers' section first, unrecorded as «لم يسجل بعد», with a separate count per section", () => {
    routeFetch(() => json(200, roster))
    renderTaker()
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    expect(headings[0]).toBe("حضور المعلمين")
    expect(headings[1]).toMatch(/^حضور الطلبة/)
    expect(headings).toContain("سجل التعديلات")
    const teachers = within(section("حضور المعلمين"))
    expect(teachers.getByText("حضور المعلمين:", { exact: false }).textContent).toContain("1/2")
    expect(teachers.getAllByText("لم يسجل بعد")).toHaveLength(1)
    expect(within(section("حضور الطلبة")).getByText("حضور الطلبة:", { exact: false }).textContent).toContain("1/2")
  })

  it("the save button stays disabled until something changes", () => {
    routeFetch(() => json(200, roster))
    renderTaker()
    expect(screen.getByRole("button", { name: "حفظ الحضور" })).toHaveProperty("disabled", true)
  })

  it("a teachers-only save sends only the changed teacher (with the value shown), never the students", async () => {
    const puts = routeFetch(() => json(200, { ...roster, teacherRecordedCount: 2 }))
    renderTaker()
    const teachers = within(section("حضور المعلمين"))
    fireEvent.click(within(teachers.getByRole("radiogroup", { name: "حضور سلمى المؤدب" })).getByRole("radio", { name: "متأخر" }))
    fireEvent.click(screen.getByRole("button", { name: "حفظ الحضور" }))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({ teachers: [{ teacherId: "t2", status: "LATE", note: null, expectedStatus: null }] })
  })

  it("a correction sends the previous status as expectedStatus; untouched rows are not sent", async () => {
    const puts = routeFetch(() => json(200, roster))
    renderTaker()
    const students = within(section("حضور الطلبة"))
    fireEvent.click(within(students.getByRole("radiogroup", { name: "حضور أنس التونسي" })).getByRole("radio", { name: "غائب" }))
    fireEvent.click(within(section("حضور المعلمين").parentElement!).getAllByRole("radiogroup")[0].querySelector('[aria-checked="false"]')!)
    fireEvent.click(screen.getByRole("button", { name: "حفظ الحضور" }))
    // One student still unrecorded → partial-save confirmation
    fireEvent.click(await screen.findByRole("button", { name: "حفظ كتسجيل جزئي" }))
    await waitFor(() => expect(puts).toHaveLength(1))
    const body = puts[0] as { records: unknown[]; teachers: { teacherId: string; expectedStatus: string }[] }
    expect(body.records).toEqual([{ studentId: "s1", status: "ABSENT", note: null, expectedStatus: "PRESENT" }])
    expect(body.teachers).toHaveLength(1)
    expect(body.teachers[0]).toMatchObject({ teacherId: "t1", expectedStatus: "PRESENT" })
  })

  it("a concurrent change (409) shows the API's Arabic message and offers to reload, without losing the page", async () => {
    const message = "عدّل مستخدم آخر حضور هذه الحصة في الأثناء: أعد تحميل الصفحة لرؤية آخر القيم ثم أعد التعديل"
    routeFetch(() => json(409, { code: "ATTENDANCE_CHANGED", message, conflicts: [{ subject: "TEACHER", id: "t2" }] }))
    renderTaker()
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "حضور سلمى المؤدب" })).getByRole("radio", { name: "حاضر" }))
    fireEvent.click(screen.getByRole("button", { name: "حفظ الحضور" }))
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.getByRole("button", { name: "تحميل آخر القيم" })).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it("correction window closed (teacher): saved rows are locked and shown read-only, unrecorded rows can still be recorded", async () => {
    const puts = routeFetch(() => json(200, roster))
    renderTaker({ ...roster, correctable: false })
    expect(screen.getByText("انتهت مهلة تعديل الحضور المسجَّل")).toBeTruthy()
    // Saved: أنس (student) and مريم (teacher) → no status buttons
    expect(screen.queryByRole("radiogroup", { name: "حضور أنس التونسي" })).toBeNull()
    expect(screen.queryByRole("radiogroup", { name: "حضور مريم المؤدب" })).toBeNull()
    // Not recorded yet: يوسف and سلمى can be recorded
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "حضور يوسف التونسي" })).getByRole("radio", { name: "حاضر" }))
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "حضور سلمى المؤدب" })).getByRole("radio", { name: "حاضر" }))
    fireEvent.click(screen.getByRole("button", { name: "حفظ الحضور" }))
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({
      records: [{ studentId: "s2", status: "PRESENT", note: null, expectedStatus: null }],
      teachers: [{ teacherId: "t2", status: "PRESENT", note: null, expectedStatus: null }],
    })
  })
})
