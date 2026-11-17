import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import {
  useCreateTeacherAnnouncement,
  useTeacherAnnouncementAction,
  useUpdateTeacherAnnouncement,
  type AnnouncementDto,
} from "@/lib/api/announcements"
import { clearSession, setSession } from "@/lib/api/session"
import type { Lookups } from "@/lib/domain"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient, testQueryClient, wrapperFor } from "@/test/render"

import { TeacherAnnouncementActions, TeacherAnnouncementEditor, teacherActionsFor } from "./teacher-announcement-actions"
import { eligibleClasses } from "./teacher-announcement-audience"
import { TeacherAnnouncementFormSheet } from "./teacher-announcement-form"
import { TeacherAnnouncementCard, TeacherAnnouncements } from "./teacher-announcements"

/*
 * Teacher announcements on the web — network mocked (no database):
 * TEACHER endpoints only, the teacher's current ACTIVE classes only, and only
 * the actions the API allows on their own announcements.
 */

// jsdom lacks what cmdk (behind MultiSelect) uses: minimal stubs, this file only
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView ??= () => {}
})

const ME = "t-teacher"
const lookups: Lookups = {
  branches: [{ id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [],
  groups: [
    { id: "g1", name: "مجموعة الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
    { id: "g2", name: "مجموعة الأرقم", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
    { id: "g3", name: "مجموعة أخرى", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
  ],
  groupClasses: [
    // I SUPERVISE c1, ASSIST in c2; c3 is another teacher's (carried for a shared slot); c4 is mine but INACTIVE
    { id: "c1", groupId: "g1", branchId: "b1", supervisorId: ME, assistantIds: [], status: "ACTIVE" },
    { id: "c2", groupId: "g2", branchId: "b1", supervisorId: "t-2", assistantIds: [ME], status: "ACTIVE" },
    { id: "c3", groupId: "g3", branchId: "b1", supervisorId: "t-3", assistantIds: [], status: "ACTIVE" },
    { id: "c4", groupId: "g3", branchId: "b1", supervisorId: ME, assistantIds: [], status: "INACTIVE" },
  ],
  teachers: [],
  schedules: [],
}
const announcement = (id: string, extra: Partial<AnnouncementDto> = {}): AnnouncementDto =>
  ({
    id,
    title: "مراجعة يوم السبت",
    content: "مراجعة جماعية",
    audience: "SPECIFIC_GROUP_CLASSES",
    status: "PUBLISHED",
    state: "ACTIVE",
    scheduledFor: null,
    scheduledForLocal: null,
    publishedAt: "2026-11-12T08:30:00Z",
    expiresAt: null,
    archivedAt: null,
    groupClasses: [{ id: "c1", group: { id: "g1", name: "مجموعة الماهر" }, branch: { id: "b1", name: "فرع المركز" } }],
    branches: [],
    publishedBy: { id: "u1", firstName: "أحمد", lastName: "المؤدب" },
    canManage: true,
    createdAt: "2026-11-12T08:00:00Z",
    updatedAt: "2026-11-12T08:30:00Z",
    ...extra,
  }) as AnnouncementDto
const page = (data: object[]) => ({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } })

type Call = { url: URL; method: string; body?: unknown }
/** Answers by request (platform preferences included); records every call. */
function routeFetch(answer: (c: Call) => Response | Promise<Response> | undefined = () => undefined) {
  const calls: Call[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: new URL(String(input)), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined }
      calls.push(call)
      const hit = await answer(call)
      if (hit) return hit
      if (call.url.pathname.endsWith("/platform-preferences"))
        return json(200, { timezone: "Africa/Tunis", dateFormat: "DD_MM_YYYY", defaultCalendarView: "WEEK", defaultPageSize: 10, currentAcademicYear: null })
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return calls
}
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET")
const neverAdmin = (calls: Call[]) => expect(calls.some((c) => c.url.pathname.includes("/admin/"))).toBe(false)
const rtl = (ui: React.ReactElement) => renderWithClient(<DirectionProvider dir="rtl">{ui}</DirectionProvider>)

beforeEach(() => {
  clearSession()
  setSession(authResponse("teacher", ["TEACHER"]))
})

describe("eligible audience", () => {
  it("supervised AND assisted classes, active only — never another teacher's, never an inactive one", () => {
    expect(eligibleClasses(ME, lookups).map((c) => c.value)).toEqual(["c1", "c2"])
  })

  it("an assistant-only teacher gets their assisted class", () => {
    expect(eligibleClasses("t-2", lookups).map((c) => c.value)).toEqual(["c2"])
  })
})

describe("actions by status — only on my own announcements", () => {
  const labels = (a: AnnouncementDto) => teacherActionsFor(a, { edit: () => {}, confirm: () => {} }).map((x) => x.label)

  it("draft: edit / publish / delete · published: edit / archive / delete · archived: delete only (no restore)", () => {
    expect(labels(announcement("a", { status: "DRAFT", state: "DRAFT" }))).toEqual(["تعديل", "نشر الآن", "حذف"])
    expect(labels(announcement("a"))).toEqual(["تعديل", "أرشفة", "حذف"])
    expect(labels(announcement("a", { status: "ARCHIVED", state: "ARCHIVED" }))).toEqual(["حذف"])
  })

  it("someone else's announcement: no action at all (no menu rendered)", () => {
    expect(labels(announcement("a", { canManage: false }))).toEqual([])
    rtl(<TeacherAnnouncementActions announcement={announcement("a", { canManage: false })} classes={[]} />)
    expect(screen.queryByRole("button", { name: /إجراءات/ })).toBeNull()
  })
})

describe("API hooks — teacher endpoints only, never /admin", () => {
  const hook = <T,>(use: () => T) => renderHook(use, { wrapper: wrapperFor(testQueryClient()) }).result

  it("draft creation: TeacherAnnouncementDto with SEVERAL classes and mode DRAFT", async () => {
    const calls = routeFetch((c) => (c.method === "POST" ? json(201, { announcement: announcement("a9", { status: "DRAFT", state: "DRAFT" }), notifiedCount: 0 }) : undefined))
    const result = hook(() => useCreateTeacherAnnouncement())
    await act(() => result.current.mutateAsync({ input: { title: "ت", content: "ن", groupClassIds: ["c1", "c2"], expiresAt: null }, mode: "DRAFT" }))
    expect(writes(calls)).toEqual([
      expect.objectContaining({ method: "POST", body: { title: "ت", content: "ن", groupClassIds: ["c1", "c2"], expiresAt: null, mode: "DRAFT" } }),
    ])
    expect(writes(calls)[0].url.pathname).toBe("/api/teacher/announcements")
    neverAdmin(calls)
  })

  it("immediate publication: mode PUBLISH_NOW (the server notifies and reports notifiedCount)", async () => {
    const calls = routeFetch((c) => (c.method === "POST" ? json(201, { announcement: announcement("a9"), notifiedCount: 5 }) : undefined))
    const result = hook(() => useCreateTeacherAnnouncement())
    const res = await act(() => result.current.mutateAsync({ input: { title: "ت", content: "ن", groupClassIds: ["c1"], expiresAt: "2026-12-31" }, mode: "PUBLISH_NOW" }))
    expect(writes(calls)[0].body).toMatchObject({ groupClassIds: ["c1"], expiresAt: "2026-12-31", mode: "PUBLISH_NOW" })
    expect(res.notifiedCount).toBe(5)
  })

  it("editing a PUBLISHED one never sends its classes; a draft does", async () => {
    const calls = routeFetch((c) => (c.method === "PATCH" ? json(200, announcement("a1")) : undefined))
    const result = hook(() => useUpdateTeacherAnnouncement("a1"))
    const input = { title: "ت", content: "ن", groupClassIds: ["c1"], expiresAt: "2026-12-31" }
    await act(() => result.current.mutateAsync({ input, published: true }))
    await act(() => result.current.mutateAsync({ input, published: false }))
    const [published, draft] = writes(calls)
    expect(published.url.pathname).toBe("/api/teacher/announcements/a1")
    expect(published.body).toEqual({ title: "ت", content: "ن", expiresAt: "2026-12-31" })
    expect(draft.body).toEqual({ title: "ت", content: "ن", expiresAt: "2026-12-31", groupClassIds: ["c1"] })
    neverAdmin(calls)
  })

  it("publish / archive / delete on /api/teacher/announcements/:id", async () => {
    const calls = routeFetch((c) =>
      c.method === "DELETE" ? new Response(null, { status: 204 }) : c.method === "POST" ? json(200, { announcement: announcement("a1"), notifiedCount: 0 }) : undefined
    )
    const result = hook(() => useTeacherAnnouncementAction("a1"))
    await act(() => result.current.mutateAsync("publish"))
    await act(() => result.current.mutateAsync("archive"))
    await act(() => result.current.mutateAsync("delete"))
    expect(writes(calls).map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      "POST /api/teacher/announcements/a1/publish",
      "POST /api/teacher/announcements/a1/archive",
      "DELETE /api/teacher/announcements/a1",
    ])
  })

  it.each([
    [403, "ANNOUNCEMENT_CLASS_ACCESS_DENIED", "lost class eligibility"],
    [403, "ANNOUNCEMENT_EDIT_FORBIDDEN", "another teacher's announcement"],
    [404, "ANNOUNCEMENT_NOT_FOUND", "another teacher's draft (private)"],
    [409, "ANNOUNCEMENT_PUBLISH_CONFLICT", "already published"],
  ])("%s %s (%s) is surfaced as is — nothing assumed", async (status, code) => {
    routeFetch((c) => (c.method === "POST" ? json(status, { code, message: "رسالة الخادم" }) : undefined))
    const result = hook(() => useTeacherAnnouncementAction("a1"))
    await expect(act(() => result.current.mutateAsync("publish"))).rejects.toMatchObject({ status, code })
  })
})

describe("form", () => {
  const classes = eligibleClasses(ME, lookups)
  const renderForm = (props: Partial<Parameters<typeof TeacherAnnouncementFormSheet>[0]> = {}) => {
    const onSave = vi.fn()
    rtl(<TeacherAnnouncementFormSheet open onOpenChange={() => {}} classes={classes} onSave={onSave} {...props} />)
    return onSave
  }
  const fill = () => {
    fireEvent.change(screen.getByLabelText(/العنوان/), { target: { value: "مراجعة" } })
    fireEvent.change(screen.getByLabelText(/المحتوى/), { target: { value: "نص" } })
  }

  it("no default audience: without an explicit class nothing is saved; no scheduling for teachers", () => {
    const onSave = renderForm()
    fill()
    expect(screen.getByRole("radio", { name: /نشر الآن/ }).getAttribute("aria-checked")).toBe("true")
    expect(screen.queryByRole("radio", { name: /جدولة/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "نشر الإعلان" }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText("اختر فصلًا واحدًا على الأقل")).toBeTruthy()
  })

  it("several classes chosen explicitly (only eligible ones offered), the audience summarized, saved as a draft", async () => {
    const onSave = renderForm()
    fill()
    fireEvent.click(screen.getByRole("combobox"))
    const options = await screen.findAllByRole("option")
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining("مجموعة الماهر"), expect.stringContaining("مجموعة الأرقم")])
    fireEvent.click(options[0])
    fireEvent.click(options[1])
    expect(screen.getByTestId("tann-audience").textContent).toContain("مجموعة الأرقم")
    fireEvent.click(screen.getByRole("radio", { name: /حفظ كمسودة/ }))
    fireEvent.click(screen.getByRole("button", { name: "حفظ كمسودة" }))
    expect(onSave).toHaveBeenCalledWith({ input: expect.objectContaining({ groupClassIds: ["c1", "c2"] }), mode: "DRAFT" })
  })

  it("editing my draft: classes I no longer teach are dropped, never sent back", () => {
    const draft = announcement("a1", {
      status: "DRAFT",
      state: "DRAFT",
      groupClasses: [
        { id: "c1", group: { id: "g1", name: "مجموعة الماهر" }, branch: { id: "b1", name: "فرع المركز" } },
        { id: "c3", group: { id: "g3", name: "مجموعة أخرى" }, branch: { id: "b1", name: "فرع المركز" } },
      ],
    })
    const onSave = renderForm({ announcement: draft })
    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))
    expect(onSave.mock.calls[0][0].input.groupClassIds).toEqual(["c1"])
  })

  it("editing a PUBLISHED one: audience read-only, no publication choice", () => {
    renderForm({ announcement: announcement("a1") })
    expect(screen.getByText("لا يمكن تغيير الفصول بعد النشر.")).toBeTruthy()
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("radio", { name: /نشر الآن/ })).toBeNull()
    expect(within(screen.getByRole("list", { name: "الفصول المستهدفة" })).getByText("مجموعة الماهر — فرع المركز")).toBeTruthy()
  })
})

describe("editor — duplicate submits and failures", () => {
  const draft = announcement("a1", { status: "DRAFT", state: "DRAFT" })

  it("a double submit sends ONE request", async () => {
    let release!: () => void
    const calls = routeFetch((c) =>
      c.method === "PATCH" ? new Promise<Response>((resolve) => (release = () => resolve(json(200, draft)))) : undefined
    )
    rtl(<TeacherAnnouncementEditor open onOpenChange={() => {}} announcement={draft} classes={eligibleClasses(ME, lookups)} />)
    const save = screen.getByRole("button", { name: "حفظ التعديلات" })
    fireEvent.click(save)
    fireEvent.click(save)
    await waitFor(() => expect(writes(calls)).toHaveLength(1))
    await act(async () => release())
    expect(writes(calls)).toHaveLength(1)
  })

  it("a 403 (class no longer mine) is shown in the form, and what was typed stays", async () => {
    routeFetch((c) =>
      c.method === "PATCH" ? json(403, { code: "ANNOUNCEMENT_CLASS_ACCESS_DENIED", message: "لا يمكنك النشر إلا لفصولك الحالية" }) : undefined
    )
    rtl(<TeacherAnnouncementEditor open onOpenChange={() => {}} announcement={draft} classes={eligibleClasses(ME, lookups)} />)
    fireEvent.change(screen.getByLabelText(/العنوان/), { target: { value: "عنوان جديد" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))
    expect(await screen.findByText("لا يمكنك النشر إلا لفصولك الحالية")).toBeTruthy()
    expect((screen.getByLabelText(/العنوان/) as HTMLInputElement).value).toBe("عنوان جديد")
  })
})

describe("teacher announcements page", () => {
  it("the feed: live announcements from the teacher endpoint (status=PUBLISHED); «إعلان جديد» with an eligible class", async () => {
    const calls = routeFetch((c) =>
      c.url.pathname === "/api/teacher/announcements"
        ? json(200, page([announcement("a1"), announcement("a2", { title: "إعلان منتهٍ", state: "EXPIRED" })]))
        : undefined
    )
    rtl(<TeacherAnnouncements teacherId={ME} lookups={lookups} />)
    expect(await screen.findByText("مراجعة يوم السبت")).toBeTruthy()
    expect(screen.queryByText("إعلان منتهٍ")).toBeNull()
    expect(screen.getAllByRole("button", { name: "إعلان جديد" }).length).toBeGreaterThan(0)
    expect(calls.find((c) => c.url.pathname === "/api/teacher/announcements")!.url.searchParams.get("status")).toBe("PUBLISHED")
    neverAdmin(calls)
  })

  it("«إعلاناتي»: mine=true, every state with its badge and audience", async () => {
    const calls = routeFetch((c) =>
      c.url.pathname === "/api/teacher/announcements"
        ? json(200, page(c.url.searchParams.get("mine") === "true" ? [announcement("a3", { title: "مسودتي", status: "DRAFT", state: "DRAFT" })] : []))
        : undefined
    )
    rtl(<TeacherAnnouncements teacherId={ME} lookups={lookups} />)
    fireEvent.click(await screen.findByRole("tab", { name: "إعلاناتي" }))
    expect(await screen.findByText("مسودتي")).toBeTruthy()
    expect(screen.getByText("مسودة")).toBeTruthy()
    expect(screen.getByText("مجموعة الماهر — فرع المركز")).toBeTruthy()
    await waitFor(() => expect(calls.some((c) => c.url.searchParams.get("mine") === "true")).toBe(true))
  })

  it("no eligible class: no «إعلان جديد»", async () => {
    routeFetch((c) => (c.url.pathname === "/api/teacher/announcements" ? json(200, page([])) : undefined))
    rtl(<TeacherAnnouncements teacherId="t-nobody" lookups={lookups} />)
    expect(await screen.findByText("لا توجد فصول نشطة مسندة إليك حاليًا لنشر الإعلانات.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "إعلان جديد" })).toBeNull()
  })
})

describe("announcement card — the same metadata as on mobile", () => {
  const classTarget = (n: number) => ({ id: `c${n}`, group: { id: `g${n}`, name: `مجموعة ${n}` }, branch: { id: "b1", name: "فرع المركز" } })
  const card = (a: AnnouncementDto, mine = false) => rtl(<TeacherAnnouncementCard announcement={a} today="2026-11-17" mine={mine} />)

  it("title, preview, targeted class with its branch, publisher and publication day", () => {
    card(announcement("a1"))
    expect(screen.getByRole("heading", { name: "مراجعة يوم السبت" })).toBeTruthy()
    expect(screen.getByText("مراجعة جماعية")).toBeTruthy()
    expect(screen.getByText("مجموعة الماهر — فرع المركز")).toBeTruthy()
    expect(screen.getByTestId("announcement-publisher").textContent).toBe("أحمد المؤدب")
    expect(screen.getByText(/12 نوفمبر 2026/)).toBeTruthy()
  })

  it("several classes: three chips, the others summed up as «+n» and still named (tooltip / screen readers)", () => {
    card(announcement("a1", { groupClasses: [1, 2, 3, 4, 5].map(classTarget) }))
    const audience = screen.getByLabelText("الجمهور المستهدف")
    expect(within(audience).getByText("مجموعة 3 — فرع المركز")).toBeTruthy()
    expect(within(audience).queryByText("مجموعة 4 — فرع المركز")).toBeNull()
    const more = within(audience).getByText("+2")
    expect(more.getAttribute("title")).toBe("مجموعة 4 — فرع المركز، مجموعة 5 — فرع المركز")
  })

  it("an association-wide announcement shows its audience label (no classes)", () => {
    card(announcement("a1", { audience: "TEACHERS", groupClasses: [] }))
    expect(within(screen.getByLabelText("الجمهور المستهدف")).getByText("المعلمون")).toBeTruthy()
  })

  it("missing publisher names: no empty name, the date stays", () => {
    card(announcement("a1", { publishedBy: { id: "u1", firstName: "", lastName: "" } }))
    expect(screen.queryByTestId("announcement-publisher")).toBeNull()
    expect(screen.getByText(/12 نوفمبر 2026/)).toBeTruthy()
  })

  it("«إعلاناتي»: the state badge and the full publication line", () => {
    card(announcement("a1", { status: "DRAFT", state: "DRAFT", publishedAt: null }), true)
    expect(screen.getByText("مسودة")).toBeTruthy()
    expect(screen.getByText("مسودة — لم تُنشر بعد")).toBeTruthy()
  })
})
