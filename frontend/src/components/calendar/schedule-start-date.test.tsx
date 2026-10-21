import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { TooltipProvider } from "@/components/ui/tooltip"
import { toApiError } from "@/lib/api/errors"
import { formatDate } from "@/lib/format"
import { clearSession, setSession } from "@/lib/api/session"
import { addDays, todayInTunis, weekdayOf } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { AcademicYear, WeeklySchedule, WeeklySlotSave } from "@/types/domain"

import { CalendarView } from "./calendar-view"
import { pastLessonDates, ScheduleFormSheet } from "./schedule-form-sheet"
import { useSaveWeeklySlot } from "./scheduling-actions"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
// The current academic year of each test (none: undefined)
const current = vi.hoisted(() => ({ year: undefined as AcademicYear | undefined }))
vi.mock("@/lib/store/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/settings")>()),
  useCurrentAcademicYear: () => current.year,
  useAcademicYears: () => (current.year ? [current.year] : []),
}))
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const TODAY = todayInTunis()
const YEAR_START = addDays(TODAY, -35)
const YEAR_END = addDays(TODAY, 200)
const yearOf = (startDate: string, endDate: string) =>
  ({ id: "y1", label: "2026-2027", isCurrent: true, startDate, endDate }) as AcademicYear
/** Its past dates since the year's start: TODAY-3, -10, -17, -24, -31 */
const DAY = weekdayOf(addDays(TODAY, -3))

const lookups: Lookups = {
  branches: [{ id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [{ id: "r1", branchId: "b1", name: "القاعة 1", status: "ACTIVE" }],
  groups: [{ id: "g1", name: "الارقم", audience: "", status: "ACTIVE", createdAt: "2026-09-01" }],
  groupClasses: [{ id: "c1", groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" }],
  teachers: [{ id: "t1", firstName: "درة", lastName: "ن", phone: "", status: "ACTIVE", joinedAt: "2024-09-01" }],
  schedules: [],
}

/** The preview of a later start date («…/start-date-impact»), per test */
const impact = vi.hoisted(() => ({ removable: [] as { id: string; date: string; reasons: [] }[], protected: [] as unknown[], calls: [] as string[] }))
function routeFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/start-date-impact")) {
        impact.calls.push(url)
        const startDate = new URL(url).searchParams.get("startDate")
        return json(200, { startDate, previousStartDate: "", removable: impact.removable, protected: impact.protected })
      }
      if (url.includes("/platform-preferences"))
        return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
      // The week's sessions: none at all
      if (url.includes("/sessions/calendar")) return json(200, [])
      return json(404, { code: "NOT_FOUND" })
    })
  )
}

const renderForm = (schedule?: WeeklySchedule) => {
  const onSave = vi.fn<(slot: WeeklySchedule) => Promise<void>>(async () => {})
  renderWithClient(
    <DirectionProvider dir="rtl">
      <ScheduleFormSheet
        open
        onOpenChange={() => {}}
        lookups={lookups}
        schedule={schedule}
        preset={{ groupClassId: "c1", day: DAY, start: "08:00", end: "09:00", roomId: "r1" }}
        onSave={onSave}
      />
    </DirectionProvider>
  )
  return onSave
}
const field = async () => within(await screen.findByRole("dialog")).getByLabelText(/تاريخ بداية الحصص/) as HTMLInputElement
const submit = () => fireEvent.click(screen.getByRole("button", { name: "برمجة الموعد" }))

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
  current.year = yearOf(YEAR_START, YEAR_END)
  impact.removable = []
  impact.protected = []
  impact.calls = []
  routeFetch()
})

describe("«تاريخ بداية الحصص» — new weekly slot", () => {
  it("defaults to the current academic year's start, explained under the field, limited to the year", async () => {
    renderForm()
    const input = await field()
    expect(input.value).toBe(YEAR_START)
    expect(input.min).toBe(YEAR_START)
    expect(input.max).toBe(YEAR_END)
    expect(
      screen.getByText("تبدأ الحصص تلقائيًا من تاريخ بداية السنة الدراسية الحالية. يمكنك تغيير هذا التاريخ إذا بدأت الحصص في وقت لاحق.")
    ).toBeTruthy()
  })

  it("a past start asks for confirmation with the number of past lessons, then saves it", async () => {
    const onSave = renderForm()
    await field()
    submit()
    const confirm = await screen.findByRole("alertdialog")
    expect(confirm.textContent).toContain("5 حصص سابقة")
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole("button", { name: "تأكيد وبرمجة الموعد" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({ groupClassId: "c1", startDate: YEAR_START })
  })

  it("cancelling the confirmation saves nothing", async () => {
    const onSave = renderForm()
    await field()
    submit()
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /إلغاء/ }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(onSave).not.toHaveBeenCalled()
  })

  it("a later (future) start: no confirmation", async () => {
    const onSave = renderForm()
    fireEvent.change(await field(), { target: { value: addDays(TODAY, 7) } })
    submit()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].startDate).toBe(addDays(TODAY, 7))
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("a date outside the current year is refused in the form", async () => {
    const onSave = renderForm()
    fireEvent.change(await field(), { target: { value: addDays(YEAR_START, -1) } })
    submit()
    expect(await screen.findByText(/يجب أن يكون التاريخ داخل السنة الدراسية الحالية/)).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("no current academic year: a clear message, today by default, no past date", async () => {
    current.year = undefined
    const onSave = renderForm()
    const input = await field()
    expect(input.value).toBe(TODAY)
    expect(input.min).toBe(TODAY)
    expect(screen.getByText(/لا توجد سنة دراسية حالية: لا يمكن إنشاء حصص سابقة/)).toBeTruthy()
    fireEvent.change(input, { target: { value: addDays(TODAY, -3) } })
    submit()
    expect(await screen.findByText("لا توجد سنة دراسية حالية: لا يمكن اختيار تاريخ سابق")).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("pastLessonDates: the slot's weekday from the start to yesterday, within the year", () => {
    const past = pastLessonDates(DAY, YEAR_START, TODAY, YEAR_END)
    expect(past).toEqual([-31, -24, -17, -10, -3].map((n) => addDays(TODAY, n)))
    expect(pastLessonDates(DAY, YEAR_START, TODAY, addDays(TODAY, -20))).toEqual([-31, -24].map((n) => addDays(TODAY, n)))
    expect(pastLessonDates(DAY, TODAY, TODAY, YEAR_END)).toEqual([])
  })
})

describe("«تاريخ بداية الحصص» — editing a weekly slot", () => {
  const existing = (extra: Partial<WeeklySchedule>): WeeklySchedule => ({
    id: "s1", groupClassId: "c1", day: DAY, start: "08:00", end: "09:00", roomId: "r1", startDate: addDays(TODAY, -17), startDateSet: true, ...extra,
  })
  const save = () => fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))
  const EDIT_MESSAGE =
    "يمكنك تعديل تاريخ بداية الحصص. عند اختيار تاريخ سابق، سيتم إنشاء الحصص الناقصة تلقائيًا دون التأثير على الحصص أو سجلات الحضور الموجودة."

  it("shows the stored date, editable within the year; an unrelated edit does not send it", async () => {
    const onSave = renderForm(existing({}))
    const input = await field()
    expect(input.value).toBe(addDays(TODAY, -17))
    expect(input.min).toBe(YEAR_START)
    expect(input.max).toBe(YEAR_END)
    expect(screen.getByText(EDIT_MESSAGE)).toBeTruthy()
    fireEvent.change(screen.getAllByDisplayValue("09:00")[0], { target: { value: "09:30" } })
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].startDate).toBeUndefined()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("earlier: confirms the number of MISSING past lessons (before the previous start), then sends the date", async () => {
    const onSave = renderForm(existing({}))
    fireEvent.change(await field(), { target: { value: YEAR_START } })
    save()
    const confirm = await screen.findByRole("alertdialog")
    // -31 and -24 only: -17, -10, -3 already exist
    expect(confirm.textContent).toContain("سيتم إنشاء حصتان سابقتان بانتظار تسجيل الحضور")
    expect(confirm.textContent).toContain("العدد تقديري")
    fireEvent.click(within(confirm).getByRole("button", { name: "تأكيد وحفظ التعديلات" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "s1", startDate: YEAR_START })
  })

  it("later with no lesson before it (checked by the API): saved at once, nothing to remove", async () => {
    const onSave = renderForm(existing({}))
    fireEvent.change(await field(), { target: { value: addDays(TODAY, -5) } })
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(impact.calls[0]).toContain(`/admin/group-classes/c1/schedules/s1/start-date-impact?startDate=${addDays(TODAY, -5)}`)
    expect(onSave.mock.calls[0][0]).toMatchObject({ startDate: addDays(TODAY, -5), removeSessionIds: [] })
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("later over unused lessons: the exact number from the API, removed only once confirmed", async () => {
    impact.removable = [-17, -10, -3, 4, 11].map((n, i) => ({ id: `l${i}`, date: addDays(TODAY, n), reasons: [] }))
    const target = addDays(TODAY, 12)
    const onSave = renderForm(existing({}))
    fireEvent.change(await field(), { target: { value: target } })
    save()
    const confirm = await screen.findByRole("alertdialog")
    expect(confirm.textContent).toContain(
      `سيؤدي تغيير تاريخ بداية الحصص إلى ${formatDate(target)} إلى حذف 5 حصص سابقة لم يُسجَّل فيها أي نشاط. هل تريد المتابعة؟`
    )
    expect(confirm.textContent).toContain(formatDate(addDays(TODAY, -17)))
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole("button", { name: "تأكيد الحذف وحفظ التعديلات" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({ startDate: target, removeSessionIds: ["l0", "l1", "l2", "l3", "l4"] })
  })

  it("cancelling the removal saves nothing", async () => {
    impact.removable = [{ id: "l0", date: addDays(TODAY, -17), reasons: [] }]
    const onSave = renderForm(existing({}))
    fireEvent.change(await field(), { target: { value: addDays(TODAY, -5) } })
    save()
    const confirm = await screen.findByRole("alertdialog")
    expect(confirm.textContent).toContain("حذف حصة سابقة واحدة")
    fireEvent.click(within(confirm).getByRole("button", { name: /إلغاء/ }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(onSave).not.toHaveBeenCalled()
  })

  it("lessons with activity: the dates and reasons are explained, nothing is sent", async () => {
    impact.removable = [{ id: "l0", date: addDays(TODAY, -17), reasons: [] }]
    impact.protected = [
      { id: "p1", date: addDays(TODAY, -10), reasons: ["STUDENT_ATTENDANCE", "ATTENDANCE_HISTORY"] },
      { id: "p2", date: addDays(TODAY, -3), reasons: ["MODIFIED"] },
    ]
    const onSave = renderForm(existing({}))
    fireEvent.change(await field(), { target: { value: addDays(TODAY, 1) } })
    save()
    const error = await screen.findByText(/فيها نشاط ولا تُحذف/)
    expect(error.textContent).toContain(`${formatDate(addDays(TODAY, -10))} (حضور طلبة مسجّل، سجل تعديلات الحضور)`)
    expect(error.textContent).toContain(`${formatDate(addDays(TODAY, -3))} (عُدّلت يدويًا)`)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it("an earlier date never asks the API about removals", async () => {
    renderForm(existing({}))
    fireEvent.change(await field(), { target: { value: YEAR_START } })
    save()
    await screen.findByRole("alertdialog")
    expect(impact.calls).toEqual([])
  })

  it("the API's refusal of a later date is shown in the form", async () => {
    const message = "لا يمكن تأخير تاريخ بداية الحصص إلى 16 أكتوبر 2026: توجد 3 حصص لهذا الموعد قبل هذا التاريخ"
    const onSave = vi.fn<(slot: WeeklySchedule) => Promise<void>>(async () => {
      throw toApiError(409, { code: "SCHEDULE_START_HAS_SESSIONS", message })
    })
    renderWithClient(
      <DirectionProvider dir="rtl">
        <ScheduleFormSheet open onOpenChange={() => {}} lookups={lookups} schedule={existing({})} onSave={onSave} />
      </DirectionProvider>
    )
    fireEvent.change(await field(), { target: { value: addDays(TODAY, -5) } })
    save()
    expect(await screen.findByText(new RegExp("لا يمكن تأخير تاريخ بداية الحصص"))).toBeTruthy()
  })

  it("a legacy slot: the year's start is suggested (explained, not saved), counted from its creation day", async () => {
    const onSave = renderForm(existing({ startDate: addDays(TODAY, -5), startDateSet: false }))
    const input = await field()
    expect(input.value).toBe(YEAR_START)
    expect(screen.getByText(/التاريخ المقترح هو بداية السنة الدراسية، ولا يُحفظ إلا عند الضغط على «حفظ التعديلات»/)).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
    save()
    // -31, -24, -17, -10 (created 5 days ago: -3 exists)
    const confirm = await screen.findByRole("alertdialog")
    expect(confirm.textContent).toContain("4 حصص سابقة")
    fireEvent.click(within(confirm).getByRole("button", { name: "تأكيد وحفظ التعديلات" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].startDate).toBe(YEAR_START)
  })

  it("no current academic year: a legacy slot keeps its date unless changed; a past date is refused", async () => {
    current.year = undefined
    const onSave = renderForm(existing({ startDate: addDays(TODAY, -5), startDateSet: false }))
    const input = await field()
    expect(input.value).toBe(addDays(TODAY, -5))
    save()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].startDate).toBeUndefined()
    fireEvent.change(input, { target: { value: addDays(TODAY, -10) } })
    save()
    expect(await screen.findByText("لا توجد سنة دراسية حالية: لا يمكن اختيار تاريخ سابق")).toBeTruthy()
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})

describe("saving a weekly slot (request body)", () => {
  function Saver({ slot }: { slot: WeeklySlotSave }) {
    const save = useSaveWeeklySlot(lookups)
    return <button onClick={() => void save(slot)}>save</button>
  }
  const patches = () => {
    const calls: unknown[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") calls.push(JSON.parse(String(init.body)))
        if (String(input).includes("/platform-preferences"))
          return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
        return json(200, { generation: null })
      })
    )
    return calls
  }
  const slot: WeeklySlotSave = { id: "s1", groupClassId: "c1", day: "MON", start: "08:00", end: "09:00", roomId: "r1" }

  it("a later start date sends exactly the confirmed lessons; another edit sends neither", async () => {
    const calls = patches()
    const { unmount } = renderWithClient(<Saver slot={{ ...slot, startDate: "2026-10-20", removeSessionIds: ["a", "b"] }} />)
    fireEvent.click(screen.getByRole("button", { name: "save" }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ startDate: "2026-10-20", removeSessionIds: ["a", "b"] })
    unmount()
    renderWithClient(<Saver slot={slot} />)
    fireEvent.click(screen.getByRole("button", { name: "save" }))
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]).not.toHaveProperty("startDate")
    expect(calls[1]).not.toHaveProperty("removeSessionIds")
  })
})

describe("calendar — recurring slot vs real session", () => {
  // A Wednesday: Monday, Tuesday and Thursday are in the displayed week
  const today = "2026-10-21"
  const session = (id: string, weeklyScheduleId: string, date: string, startTime: string, endTime: string, roomId: string) => ({
    id, date, startTime, endTime, status: "SCHEDULED", cancellationReason: null, weeklyScheduleId, isExtra: false,
    groupClass: { id: "c1", status: "ACTIVE", group: { id: "g1", name: "الارقم", status: "ACTIVE" } },
    additionalClasses: [],
    room: { id: roomId, name: roomId === "r2" ? "القاعة 2" : "القاعة 1", status: "ACTIVE", branch: { id: "b1", name: "فرع المركز", status: "ACTIVE" } },
    teachers: [], attendance: { expected: 0, recorded: 0, present: 0, absent: 0, late: 0, excused: 0 },
  })
  const blocks = () =>
    screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "").filter((l) => l.includes("الارقم"))

  it("only real sessions in the past (their own time and room); the plan from today on, never before its start date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes("/platform-preferences"))
          return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
        if (url.includes("/sessions/calendar"))
          return json(200, [
            // Monday's lesson, held at 07:00 in room 2 before the slot moved to 08:00 / room 1
            session("se-mon", "s-mon", "2026-10-19", "07:00", "07:45", "r2"),
            // A legacy slot (start = its creation day, Thursday) still shows its earlier real session
            session("se-legacy", "s-legacy", "2026-10-20", "12:00", "13:00", "r1"),
          ])
        return json(404, { code: "NOT_FOUND" })
      })
    )
    const room2 = { id: "r2", branchId: "b1", name: "القاعة 2", status: "ACTIVE" as const }
    renderWithClient(
      <DirectionProvider dir="rtl">
        <TooltipProvider>
          <CalendarView
            lookups={{
              ...lookups,
              rooms: [...lookups.rooms, room2],
              schedules: [
                { id: "s-mon", groupClassId: "c1", day: "MON", start: "08:00", end: "09:00", roomId: "r1", startDate: "2026-09-01" },
                // Tuesday: past, no session — not drawn
                { id: "s-tue", groupClassId: "c1", day: "TUE", start: "09:30", end: "10:00", roomId: "r1", startDate: "2026-09-01" },
                { id: "s-legacy", groupClassId: "c1", day: "TUE", start: "12:00", end: "13:00", roomId: "r1", startDate: "2026-10-22" },
                // Thursday: upcoming plan, but it starts only later — not drawn
                { id: "s-later", groupClassId: "c1", day: "THU", start: "10:00", end: "11:00", roomId: "r1", startDate: "2026-11-20" },
                // Friday: upcoming plan, drawn
                { id: "s-fri", groupClassId: "c1", day: "FRI", start: "15:00", end: "16:00", roomId: "r1", startDate: "2026-09-01" },
              ],
            }}
            students={[]}
            today={today}
            initialFilters={{}}
          />
        </TooltipProvider>
      </DirectionProvider>
    )
    await waitFor(() => expect(blocks().some((l) => l.includes("07:00"))).toBe(true))
    const labels = blocks()
    // The real session's own time and room, not the slot's
    expect(labels.some((l) => l.includes("07:00") && l.includes("القاعة 2"))).toBe(true)
    expect(labels.some((l) => l.includes("08:00"))).toBe(false)
    expect(labels.some((l) => l.includes("12:00"))).toBe(true)
    expect(labels.some((l) => l.includes("09:30"))).toBe(false)
    expect(labels.some((l) => l.includes("10:00"))).toBe(false)
    expect(labels.some((l) => l.includes("15:00"))).toBe(true)
  })
})
