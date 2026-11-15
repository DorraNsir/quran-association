import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ExtraSessionSheet } from "@/components/calendar/scheduling-actions"
import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { toSessionRow, useSessionRange, type SessionDto, type SessionRosterDto } from "@/lib/api/sessions"
import { addDays, todayInTunis } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { DeleteExtraSessionDialog } from "./extra-session-actions"
import { SessionDetails } from "./session-details"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
// The signed-in teacher (GET /api/teacher/workspace): t1 supervises c1, t2 assists it
let me = "t1"
vi.mock("@/lib/api/workspace", () => ({
  useTeacherWorkspace: () => ({ data: { teacher: { id: me }, lookups: lookups, students: [] } }),
}))

const lookups: Lookups = {
  branches: [{ id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [
    { id: "r1", branchId: "b1", name: "القاعة 1", status: "ACTIVE" },
    { id: "r2", branchId: "b1", name: "القاعة 2", status: "ACTIVE" },
  ],
  groups: [
    { id: "g1", name: "مجموعة الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
    { id: "g2", name: "مجموعة أركان", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
  ],
  groupClasses: [
    { id: "c1", groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: ["t2"], status: "ACTIVE" },
    { id: "c2", groupId: "g2", branchId: "b1", supervisorId: "t9", assistantIds: ["t1"], status: "ACTIVE" },
  ],
  teachers: [],
  // c1's usual room: r2 (its weekly slot)
  schedules: [{ id: "w1", groupClassId: "c1", day: "MON", start: "16:00", end: "17:00", roomId: "r2" }],
}

const TODAY = todayInTunis()
const UPCOMING = addDays(TODAY, 5)
const klass = { id: "c1", status: "ACTIVE" as const, group: { id: "g1", name: "مجموعة الماهر", status: "ACTIVE" as const } }
const dto = (over: Partial<SessionDto> = {}): SessionDto => ({
  id: "se1",
  date: UPCOMING,
  startTime: "10:00",
  endTime: "11:00",
  status: "SCHEDULED",
  cancellationReason: null,
  weeklyScheduleId: null,
  isExtra: true,
  updatedAt: "2026-11-14T10:00:00.000Z",
  groupClass: klass,
  additionalClasses: [],
  room: { id: "r1", name: "القاعة 1", status: "ACTIVE", branch: { id: "b1", name: "فرع المركز", status: "ACTIVE" } },
  teachers: [
    { id: "t1", firstName: "أحمد", lastName: "المشرف", role: "SUPERVISOR", status: "ACTIVE" },
    { id: "t2", firstName: "سامي", lastName: "المساعد", role: "ASSISTANT", status: "ACTIVE" },
  ],
  attention: [],
  attendance: { expected: 1, recorded: 0, present: 0, absent: 0, late: 0, excused: 0 },
  ...over,
})
const roster = (over: Partial<SessionRosterDto> = {}): SessionRosterDto => ({
  sessionId: "se1",
  date: UPCOMING,
  startTime: "10:00",
  endTime: "11:00",
  sessionStatus: "SCHEDULED",
  expectedCount: 1,
  recordedCount: 0,
  complete: false,
  editable: false,
  correctable: false,
  students: [],
  teacherExpectedCount: 2,
  teacherRecordedCount: 0,
  teachers: [],
  ...over,
})

/** Records writes (method, url, body); answers each with `reply`. */
function routeFetch(reply: (method: string, url: string) => Response = () => json(200, dto())) {
  const writes: { method: string; url: string; body: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      if (method !== "GET") {
        writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        return reply(method, url)
      }
      if (url.includes("/platform-preferences"))
        return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return writes
}

const details = (session: SessionDto, workspace: "admin" | "teacher", rosterOver: Partial<SessionRosterDto> = {}) =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <SessionDetails row={toSessionRow(session, TODAY)} roster={roster(rosterOver)} today={TODAY} workspace={workspace} dto={session} />
    </DirectionProvider>
  )
const openMenu = () =>
  fireEvent.pointerDown(screen.getByRole("button", { name: "إجراءات الحصة" }), { button: 0, ctrlKey: false })
const menuItems = async () => (await screen.findAllByRole("menuitem")).map((i) => i.textContent?.trim())

beforeEach(() => {
  clearSession()
  push.mockReset()
  me = "t1"
})

describe("teacher session actions", () => {
  beforeEach(() => setSession(authResponse("teacher", ["TEACHER"])))

  it("the supervisor gets «إلغاء الحصة», sent to the teacher endpoint with the reason", async () => {
    const writes = routeFetch(() => json(200, dto({ status: "CANCELLED" })))
    details(dto(), "teacher")
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "إلغاء الحصة" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText(/سبب الإلغاء/), { target: { value: "مرض" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء الحصة" }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({ method: "POST", url: expect.stringContaining("/teacher/sessions/se1/cancel"), body: { cancellationReason: "مرض" } })
  })

  it("an assistant, or a lesson already started / with attendance: no action", async () => {
    routeFetch()
    me = "t2"
    const { unmount } = details(dto(), "teacher")
    expect(screen.queryByRole("button", { name: "إجراءات الحصة" })).toBeNull()
    unmount()
    me = "t1"
    const started = details(dto({ date: addDays(TODAY, -1) }), "teacher")
    expect(screen.queryByRole("button", { name: "إجراءات الحصة" })).toBeNull()
    started.unmount()
    details(dto(), "teacher", { recordedCount: 1 })
    expect(screen.queryByRole("button", { name: "إجراءات الحصة" })).toBeNull()
  })

  it("the API's Arabic refusal is shown in the cancel dialog", async () => {
    const message = "بدأت هذه الحصة أو انتهى موعدها: لا يمكن إلغاؤها"
    routeFetch(() => json(409, { code: "SESSION_ALREADY_STARTED", message }))
    details(dto(), "teacher")
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "إلغاء الحصة" }))
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء الحصة" }))
    expect(await within(dialog).findByText(message)).toBeTruthy()
  })

  it("the extra-lesson form lists only the classes the teacher supervises and uses the teacher endpoint", async () => {
    const writes = routeFetch(() => json(201, dto()))
    renderWithClient(
      <DirectionProvider dir="rtl">
        <ExtraSessionSheet open onOpenChange={() => {}} lookups={lookups} scope="teacher" supervisorId="t1" />
      </DirectionProvider>
    )
    const dialog = await screen.findByRole("dialog")
    // c2 (only assisted) is not offered: the single supervised class is pre-selected
    expect(within(dialog).queryByText("مجموعة أركان")).toBeNull()
    fireEvent.change(within(dialog).getByLabelText(/التاريخ/), { target: { value: UPCOMING } })
    expect(within(dialog).getByRole("combobox", { name: /القاعة/ }).textContent).toContain("القاعة 2")
    fireEvent.click(within(dialog).getByRole("button", { name: "برمجة الحصة الإضافية" }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      method: "POST",
      url: expect.stringContaining("/teacher/sessions/extra"),
      body: { groupClassId: "c1", roomId: "r2", date: UPCOMING, startTime: "09:00", endTime: "10:30" },
    })
  })

  it("a start already passed today is refused in the form, without calling the API", async () => {
    const writes = routeFetch()
    renderWithClient(
      <DirectionProvider dir="rtl">
        <ExtraSessionSheet open onOpenChange={() => {}} lookups={lookups} scope="teacher" supervisorId="t1" />
      </DirectionProvider>
    )
    const dialog = await screen.findByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText(/التاريخ/), { target: { value: TODAY } })
    fireEvent.change(within(dialog).getByLabelText(/^من/), { target: { value: "00:00" } })
    fireEvent.change(within(dialog).getByLabelText(/^إلى/), { target: { value: "00:15" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "برمجة الحصة الإضافية" }))
    expect(await within(dialog).findByText("هذا الوقت قد مضى: اختر موعدًا لم يحن بعد")).toBeTruthy()
    expect(writes).toHaveLength(0)
  })
})

describe("admin extra-session actions", () => {
  beforeEach(() => setSession(authResponse("admin")))

  it("an upcoming extra lesson: edit, cancel and permanent delete", async () => {
    routeFetch()
    details(dto(), "admin")
    openMenu()
    expect(await menuItems()).toEqual(expect.arrayContaining(["تعديل الحصة", "إلغاء هذه الحصة", "حذف نهائي"]))
  })

  it("a regular lesson: no edit, no permanent delete", async () => {
    routeFetch()
    details(dto({ isExtra: false, weeklyScheduleId: "w1" }), "admin")
    openMenu()
    const items = await menuItems()
    expect(items).toContain("إلغاء هذه الحصة")
    expect(items).not.toContain("حذف نهائي")
    expect(items).not.toContain("تعديل الحصة")
  })

  it("a completed lesson: no delete, no cancel", async () => {
    routeFetch()
    details(dto({ status: "COMPLETED", date: addDays(TODAY, -2) }), "admin", { recordedCount: 1 })
    // No delete, no cancel (formerly offered and refused by the API), nothing else either: no menu
    expect(screen.queryByRole("button", { name: "إجراءات الحصة" })).toBeNull()
  })

  it("a cancelled extra lesson can still be deleted", async () => {
    routeFetch()
    details(dto({ status: "CANCELLED", date: addDays(TODAY, -3) }), "admin")
    openMenu()
    expect(await menuItems()).toContain("حذف نهائي")
  })

  it("permanent delete needs the confirmation, then DELETEs and leaves the page", async () => {
    const writes = routeFetch(() => new Response(null, { status: 204 }))
    details(dto(), "admin")
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "حذف نهائي" }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("حذف الحصة نهائيًا")).toBeTruthy()
    expect(within(dialog).getByText(/لا يمكن التراجع عن هذا الإجراء/)).toBeTruthy()
    // Nothing deleted before the confirmation
    expect(writes).toHaveLength(0)
    expect(within(dialog).getByRole("button", { name: "تراجع" })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "حذف نهائي" }))
    await waitFor(() => expect(writes).toEqual([{ method: "DELETE", url: expect.stringContaining("/admin/sessions/se1"), body: undefined }]))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/sessions"))
  })

  it("a refused delete shows the API's Arabic message and stays on the page", async () => {
    const message = "لا يمكن حذف حصة مرتبطة بأعمال الطلبة"
    routeFetch(() => json(409, { code: "SESSION_HAS_WORK", message }))
    details(dto(), "admin")
    openMenu()
    fireEvent.click(await screen.findByRole("menuitem", { name: "حذف نهائي" }))
    const dialog = await screen.findByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "حذف نهائي" }))
    expect(await within(dialog).findByText(message)).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it("edit: prefilled, host class locked, sends the change with expectedUpdatedAt", async () => {
    const writes = routeFetch(() => json(200, dto()))
    renderWithClient(
      <DirectionProvider dir="rtl">
        <ExtraSessionSheet open onOpenChange={() => {}} lookups={lookups} session={dto()} />
      </DirectionProvider>
    )
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("تعديل الحصة الإضافية")).toBeTruthy()
    expect((within(dialog).getByLabelText(/التاريخ/) as HTMLInputElement).value).toBe(UPCOMING)
    expect((within(dialog).getByLabelText(/^من/) as HTMLInputElement).value).toBe("10:00")
    expect((within(dialog).getByLabelText(/^إلى/) as HTMLInputElement).value).toBe("11:00")
    expect(within(dialog).getByRole("combobox", { name: /القاعة/ }).textContent).toContain("القاعة 1")
    // The class is shown, not editable
    expect(within(dialog).getByText("لا يمكن تغيير قسم الحصة")).toBeTruthy()
    expect(within(dialog).queryByRole("combobox", { name: /المجموعة/ })).toBeNull()
    fireEvent.change(within(dialog).getByLabelText(/^من/), { target: { value: "12:00" } })
    fireEvent.change(within(dialog).getByLabelText(/^إلى/), { target: { value: "13:00" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعديل" }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({
      method: "PATCH",
      url: expect.stringContaining("/admin/sessions/se1"),
      body: { date: UPCOMING, startTime: "12:00", endTime: "13:00", roomId: "r1", expectedUpdatedAt: "2026-11-14T10:00:00.000Z" },
    })
  })

  it("edit: a stale form is refused with the API's message (nothing overwritten)", async () => {
    const message = "عُدّلت هذه الحصة للتو من طرف مستخدم آخر: أعد فتحها ثم احفظ تعديلك مجددًا"
    routeFetch(() => json(409, { code: "SESSION_CHANGED", message }))
    renderWithClient(
      <DirectionProvider dir="rtl">
        <ExtraSessionSheet open onOpenChange={() => {}} lookups={lookups} session={dto()} />
      </DirectionProvider>
    )
    const dialog = await screen.findByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعديل" }))
    expect(await within(dialog).findByText(message)).toBeTruthy()
  })
})

describe("session details: attendance before the start", () => {
  beforeEach(() => setSession(authResponse("admin")))

  it("an upcoming lesson shows the action disabled with when it opens; an open roster links to the sheet", async () => {
    routeFetch()
    const { unmount } = details(dto(), "admin")
    const waiting = screen.getByRole("button", { name: "تسجيل الحضور" }) as HTMLButtonElement
    expect(waiting.disabled).toBe(true)
    expect(screen.getByText(/^يبدأ تسجيل الحضور يوم .* عند الساعة 10:00$/)).toBeTruthy()
    unmount()
    details(dto({ date: addDays(TODAY, -1) }), "admin", { editable: true })
    expect(screen.getByRole("link", { name: "تسجيل الحضور" }).getAttribute("href")).toBe("/admin/sessions/se1/attendance")
    expect(screen.queryByText(/يبدأ تسجيل الحضور/)).toBeNull()
  })

  it("a cancelled lesson shows no attendance action at all", async () => {
    routeFetch()
    details(dto({ status: "CANCELLED" }), "admin")
    expect(screen.queryByRole("button", { name: "تسجيل الحضور" })).toBeNull()
    expect(screen.queryByRole("link", { name: "تسجيل الحضور" })).toBeNull()
  })
})

/** A calendar range of sessions + the delete dialog of one of them. */
function CalendarWithDelete({ open }: { open: boolean }) {
  const range = useSessionRange("admin", { from: TODAY, to: addDays(TODAY, 6) })
  return (
    <>
      <ul data-testid="calendar-sessions">
        {(range.data ?? []).map((s) => (
          <li key={s.id}>{s.id}</li>
        ))}
      </ul>
      <DeleteExtraSessionDialog session={{ id: "se1", date: UPCOMING }} open={open} onOpenChange={() => {}} />
    </>
  )
}

describe("after a permanent delete", () => {
  beforeEach(() => setSession(authResponse("admin")))

  it("the calendar range is refreshed: the session disappears", async () => {
    let deleted = false
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === "DELETE") {
          deleted = true
          return new Response(null, { status: 204 })
        }
        if (url.includes("/admin/sessions/calendar")) return json(200, deleted ? [dto({ id: "se2" })] : [dto(), dto({ id: "se2" })])
        return json(404, { code: "NOT_FOUND" })
      })
    )
    renderWithClient(
      <DirectionProvider dir="rtl">
        <CalendarWithDelete open />
      </DirectionProvider>
    )
    const list = screen.getByTestId("calendar-sessions")
    expect(await within(list).findByText("se1")).toBeTruthy()
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "حذف نهائي" }))
    await waitFor(() => expect(within(list).queryByText("se1")).toBeNull())
    expect(within(list).getByText("se2")).toBeTruthy()
  })
})
