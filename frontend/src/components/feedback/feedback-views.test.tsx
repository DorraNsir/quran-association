import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { adminNav, studentNav, teacherNav } from "@/components/layout/nav-config"
import { clearSession, setSession } from "@/lib/api/session"
import { notificationTarget } from "@/lib/communication"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { UserNotification } from "@/types/domain"

import { AdminFeedbackDetail, AdminFeedbackScreen, MyFeedbackDetail, MyFeedbackScreen } from "./feedback-views"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))
const toastSuccess = vi.fn()
vi.mock("sonner", () => ({ toast: { success: (m: string) => toastSuccess(m), error: vi.fn(), warning: vi.fn() } }))

Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
URL.createObjectURL = () => "blob:preview"
URL.revokeObjectURL = () => {}

/** XMLHttpRequest double for the screenshot upload (POST /api/files). */
class FakeXhr {
  static instances: FakeXhr[] = []
  upload: { onprogress?: () => void } = {}
  url = ""
  withCredentials = false
  status = 0
  responseText = ""
  sent?: FormData
  onload?: () => void
  onerror?: () => void
  onabort?: () => void
  constructor() {
    FakeXhr.instances.push(this)
  }
  open(_m: string, url: string) {
    this.url = url
  }
  setRequestHeader() {}
  abort() {}
  send(body: FormData) {
    this.sent = body
    this.status = 201
    this.responseText = JSON.stringify({ id: "file-1" })
    this.onload?.()
  }
}

const feedback = (over: object = {}) => ({
  id: "f1",
  category: "BUG",
  title: "زر الحفظ لا يعمل",
  description: "لا يحدث شيء عند الضغط",
  status: "NEW",
  screenshot: null,
  response: null,
  respondedAt: null,
  resolvedAt: null,
  createdAt: "2026-11-20T10:00:00.000Z",
  updatedAt: "2026-11-20T10:00:00.000Z",
  version: 1,
  ...over,
})
const adminFeedback = (over: object = {}) => ({
  ...feedback(),
  sender: { userId: "u-t1", name: "أحمد بن علي" },
  senderRole: "TEACHER",
  respondedBy: null,
  platform: "ANDROID",
  appVersion: "1.4.0",
  screenPath: "/teacher/sessions",
  ...over,
})
const page = (data: unknown[], extra: object = {}) => ({ data, meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 }, ...extra })

type Call = { method: string; path: string; search: URLSearchParams; body: unknown }
/** fetch double: every call recorded; the answer may wait (a slow network). */
function routeFetch(answer: (c: Call) => Response | undefined | Promise<Response | undefined>) {
  const calls: Call[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const call = {
        method: init?.method ?? "GET",
        path: url.pathname,
        search: url.searchParams,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      }
      calls.push(call)
      return (await answer(call)) ?? json(404, { code: "NOT_FOUND", message: "غير موجود" })
    })
  )
  return calls
}
const renderIn = (ui: React.ReactNode) => renderWithClient(<DirectionProvider dir="rtl">{ui}</DirectionProvider>)
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET")

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["TEACHER"]))
  push.mockReset()
  toastSuccess.mockReset()
  FakeXhr.instances = []
  vi.stubGlobal("XMLHttpRequest", FakeXhr)
})
afterEach(() => vi.unstubAllGlobals())

async function openForm() {
  fireEvent.click(await screen.findByRole("button", { name: "إرسال ملاحظة" }))
  return screen.findByRole("dialog")
}
const fill = (dialog: HTMLElement, title: string, description: string) => {
  fireEvent.change(within(dialog).getByLabelText(/العنوان/), { target: { value: title } })
  fireEvent.change(within(dialog).getByLabelText(/الوصف/), { target: { value: description } })
}

describe("«الملاحظات والاقتراحات» — teacher / student (web)", () => {
  it("«ملاحظاتي»: title, category, date, status and the response indicator", async () => {
    const calls = routeFetch((c) =>
      c.path === "/api/teacher/feedback"
        ? json(200, page([feedback(), feedback({ id: "f2", title: "اقتراح", category: "IMPROVEMENT", status: "RESOLVED", response: "تم" })]))
        : undefined
    )
    renderIn(<MyFeedbackScreen space="teacher" />)
    const list = await screen.findByRole("list", { name: "ملاحظاتي" })
    const items = within(list).getAllByRole("link")
    expect(items.map((a) => a.getAttribute("href"))).toEqual(["/teacher/feedback/f1", "/teacher/feedback/f2"])
    expect(items[0]!.textContent).toContain("الإبلاغ عن مشكلة")
    expect(items[0]!.querySelector("[data-status='NEW']")!.textContent).toContain("جديد")
    expect(items[0]!.querySelector("[data-has-response]")).toBeNull()
    expect(items[1]!.querySelector("[data-status='RESOLVED']")!.textContent).toContain("تم الحل")
    expect(items[1]!.querySelector("[data-has-response]")!.textContent).toContain("ردّت الإدارة")
    expect(calls.some((c) => c.path.startsWith("/api/admin"))).toBe(false) // my own list only
  })

  it("an empty history: «لم ترسل أي ملاحظات بعد»", async () => {
    routeFetch((c) => (c.path === "/api/student/feedback" ? json(200, page([])) : undefined))
    renderIn(<MyFeedbackScreen space="student" />)
    expect(await screen.findByText("لم ترسل أي ملاحظات بعد")).toBeTruthy()
  })

  it("the form: required title and description (nothing sent); success ONLY after the server confirmed; one request for two clicks", async () => {
    let release!: () => void
    const answered = new Promise<void>((r) => (release = r))
    const calls = routeFetch(async (c) => {
      if (c.method === "GET") return json(200, page([]))
      await answered // a slow network
      return json(201, feedback({ id: "new1" }))
    })
    renderIn(<MyFeedbackScreen space="teacher" />)
    const dialog = await openForm()
    const submit = within(dialog).getByRole("button", { name: "إرسال الملاحظة" })
    fireEvent.click(submit)
    expect(await within(dialog).findByText("العنوان مطلوب")).toBeTruthy()
    expect(within(dialog).getByText("الوصف مطلوب")).toBeTruthy()
    expect(writes(calls)).toEqual([])
    fireEvent.click(within(dialog).getByRole("radio", { name: "اقتراح تحسين" }))
    fill(dialog, "  إضافة بحث في الحصص ", "أقترح خانة بحث")
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(writes(calls)).toHaveLength(1))
    await waitFor(() => expect(submit.hasAttribute("disabled")).toBe(true)) // loading
    expect(toastSuccess).not.toHaveBeenCalled() // not before the server answered
    expect(writes(calls)[0]).toMatchObject({
      path: "/api/teacher/feedback",
      body: { category: "IMPROVEMENT", title: "إضافة بحث في الحصص", description: "أقترح خانة بحث", platform: "WEB", screenPath: "/" },
    })
    expect(writes(calls)[0]!.body).not.toHaveProperty("status")
    expect(writes(calls)[0]!.body).not.toHaveProperty("createdByUserId")
    await act(async () => release())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("تم إرسال ملاحظتك بنجاح"))
    expect(push).toHaveBeenCalledWith("/teacher/feedback/new1")
    expect(writes(calls)).toHaveLength(1)
  })

  it("a screenshot: an image only (type checked), previewed, uploaded first then attached", async () => {
    const calls = routeFetch((c) =>
      c.path === "/api/student/feedback" ? (c.method === "GET" ? json(200, page([])) : json(201, feedback({ id: "new2" }))) : undefined
    )
    renderIn(<MyFeedbackScreen space="student" />)
    const dialog = await openForm()
    const input = within(dialog).getByLabelText("اختيار لقطة شاشة")
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "doc.pdf", { type: "application/pdf" })] } })
    expect(within(dialog).getByRole("alert").textContent).toContain("JPG أو PNG أو WebP")
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], "shot.png", { type: "image/png" })] } })
    expect(within(dialog).getByAltText("معاينة لقطة الشاشة")).toBeTruthy()
    fill(dialog, "صفحة الحضور", "لا تُفتح")
    fireEvent.click(within(dialog).getByRole("button", { name: "إرسال الملاحظة" }))
    await waitFor(() => expect(writes(calls)).toHaveLength(1))
    expect(FakeXhr.instances[0]!.url).toContain("/api/files?purpose=FEEDBACK_SCREENSHOT")
    expect((FakeXhr.instances[0]!.sent!.get("file") as File).name).toBe("shot.png")
    expect(writes(calls)[0]!.body).toMatchObject({ screenshotFileId: "file-1" })
  })

  it("an error (too many submissions): its Arabic message, no success, the form kept", async () => {
    routeFetch((c) =>
      c.method === "GET"
        ? json(200, page([]))
        : json(429, { code: "FEEDBACK_RATE_LIMITED", message: "أرسلت عددًا كبيرًا من الملاحظات خلال وقت قصير، يرجى المحاولة لاحقًا" })
    )
    renderIn(<MyFeedbackScreen space="teacher" />)
    const dialog = await openForm()
    fill(dialog, "عنوان", "وصف")
    fireEvent.click(within(dialog).getByRole("button", { name: "إرسال الملاحظة" }))
    expect(await within(dialog).findByText(/أرسلت عددًا كبيرًا من الملاحظات/)).toBeTruthy()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect((within(dialog).getByLabelText(/العنوان/) as HTMLInputElement).value).toBe("عنوان")
  })

  it("details: the description, the status and the admins' response", async () => {
    routeFetch((c) =>
      c.path === "/api/teacher/feedback/f1"
        ? json(200, feedback({ status: "RESOLVED", response: "شكرًا على ملاحظتك. تم إصلاح المشكلة في صفحة الحصص.", respondedAt: "2026-11-21T09:00:00.000Z" }))
        : undefined
    )
    renderIn(<MyFeedbackDetail space="teacher" id="f1" />)
    expect(await screen.findByRole("heading", { name: "زر الحفظ لا يعمل" })).toBeTruthy()
    expect(screen.getByText("لا يحدث شيء عند الضغط")).toBeTruthy()
    expect(document.querySelector("[data-status='RESOLVED']")).toBeTruthy()
    expect(document.querySelector("[data-response]")!.textContent).toContain("تم إصلاح المشكلة")
  })
})

describe("«إدارة الملاحظات والاقتراحات» — admin (web)", () => {
  beforeEach(() => setSession(authResponse("admin", ["ADMIN"])))

  it("the inbox: sender, status; search is server-side; the NEW count", async () => {
    const calls = routeFetch((c) => (c.path === "/api/admin/feedback" ? json(200, page([adminFeedback()], { newCount: 3 })) : undefined))
    renderIn(<AdminFeedbackScreen />)
    expect((await screen.findAllByText(/أحمد بن علي/)).length).toBeGreaterThan(0)
    expect(screen.getByText(/3 جديدة/)).toBeTruthy()
    fireEvent.change(screen.getByRole("searchbox", { name: "البحث في الملاحظات" }), { target: { value: "الحفظ" } })
    await waitFor(() => expect(calls.some((c) => c.search.get("search") === "الحفظ")).toBe(true))
  })

  it("an empty inbox: «لا توجد ملاحظات جديدة»", async () => {
    routeFetch((c) => (c.path === "/api/admin/feedback" ? json(200, page([], { newCount: 0 })) : undefined))
    renderIn(<AdminFeedbackScreen />)
    expect((await screen.findAllByText("لا توجد ملاحظات جديدة")).length).toBeGreaterThan(0)
  })

  it("details: sender and context; the response saved with the version read (only what changed)", async () => {
    const calls = routeFetch((c) => {
      if (c.path !== "/api/admin/feedback/f1") return undefined
      return c.method === "GET" ? json(200, adminFeedback()) : json(200, adminFeedback({ version: 2, response: "تم" }))
    })
    renderIn(<AdminFeedbackDetail id="f1" />)
    expect(await screen.findByText("أحمد بن علي (معلم)")).toBeTruthy()
    expect(screen.getByText("أندرويد")).toBeTruthy()
    expect(screen.getByText("/teacher/sessions")).toBeTruthy()
    const save = screen.getByRole("button", { name: "حفظ" })
    expect(save.hasAttribute("disabled")).toBe(true) // nothing changed yet
    fireEvent.change(screen.getByLabelText(/الرد على المرسل/), { target: { value: "  شكرًا على ملاحظتك  " } })
    fireEvent.click(save)
    await waitFor(() => expect(writes(calls)).toHaveLength(1))
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", body: { version: 1, response: "شكرًا على ملاحظتك" } })
    expect(writes(calls)[0]!.body).not.toHaveProperty("status")
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("تم حفظ التغييرات"))
  })

  it("a concurrent change: the API's message (FEEDBACK_CHANGED)", async () => {
    routeFetch((c) =>
      c.method === "GET"
        ? json(200, adminFeedback())
        : json(409, { code: "FEEDBACK_CHANGED", message: "عُدّلت هذه الملاحظة للتو من طرف مسؤول آخر: أعد فتحها ثم احفظ تعديلك" })
    )
    renderIn(<AdminFeedbackDetail id="f1" />)
    fireEvent.change(await screen.findByLabelText(/الرد على المرسل/), { target: { value: "رد" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }))
    expect(await screen.findByText(/عُدّلت هذه الملاحظة للتو/)).toBeTruthy()
  })
})

describe("visibility and notifications", () => {
  const hrefs = (nav: { items: { href: string }[] }[]) => nav.flatMap((s) => s.items.map((i) => i.href))

  it("each workspace its own entry: admins manage, teachers and students send", () => {
    expect(hrefs(adminNav)).toContain("/admin/feedback")
    expect(hrefs(teacherNav)).toContain("/teacher/feedback")
    expect(hrefs(studentNav)).toContain("/student/feedback")
    expect(hrefs(teacherNav)).not.toContain("/admin/feedback")
    expect(hrefs(studentNav)).not.toContain("/admin/feedback")
  })

  it("a feedback notification opens the submission in the workspace it is read in", () => {
    const n = {
      id: "n1",
      userId: "u",
      type: "FEEDBACK_UPDATED",
      title: "",
      message: "",
      entityType: "FEEDBACK",
      entityId: "f1",
      available: true,
      isRead: false,
      createdAt: "2026-11-21",
    } as UserNotification
    expect(notificationTarget(n, "admin")?.href).toBe("/admin/feedback/f1")
    expect(notificationTarget(n, "teacher")?.href).toBe("/teacher/feedback/f1")
    expect(notificationTarget(n, "student")?.apiPath).toBe("/student/feedback/f1")
  })
})
