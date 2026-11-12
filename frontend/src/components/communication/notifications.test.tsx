import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { DirectionProvider } from "@/components/ui/direction"
import type { NotificationDto } from "@/lib/api/notifications"
import { clearSession, setSession } from "@/lib/api/session"
import { notificationHref } from "@/lib/communication"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { UserNotification } from "@/types/domain"

import { NotificationsPage } from "./notifications"

const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))

const dto = (over: Partial<NotificationDto>): NotificationDto => ({
  id: "n",
  type: "RESOURCE_PUBLISHED",
  title: "مورد جديد",
  message: "نشر المعلم أحمد بن علي موردًا جديدًا: «تجويد»",
  entityType: "RESOURCE",
  entityId: "r1",
  available: true,
  createdAt: "2026-10-26T10:00:00.000Z",
  readAt: null,
  isRead: false,
  ...over,
})

/** The list answers with `items`, the teacher workspace with `workspace`; every request is recorded (others get {}). */
function stubApi(items: NotificationDto[], workspace: object = { students: [], groupClasses: [] }) {
  const calls: { url: string; method: string }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? "GET" })
      if (url.includes("/notifications/unread-count")) return json(200, { count: items.filter((n) => !n.readAt).length })
      if (/\/notifications\?/.test(url))
        return json(200, { data: items, meta: { page: 1, pageSize: 20, total: items.length, totalPages: 1 } })
      if (url.endsWith("/teacher/workspace")) return json(200, workspace)
      return json(200, {})
    })
  )
  return calls
}
const renderPage = (workspace: "admin" | "teacher" | "student" = "student") =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <NotificationsPage workspace={workspace} />
    </DirectionProvider>
  )
const openItem = async (message: string) => fireEvent.click((await screen.findByText(message)).closest("button")!)

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["STUDENT"]))
  push.mockClear()
  vi.mocked(toast.error).mockClear()
})

describe("notifications: deleted content and newer types", () => {
  it("a notification whose content was deleted stays listed, is marked read and opens nothing", async () => {
    const calls = stubApi([dto({ id: "gone", available: false, message: "نشر المعلم أحمد موردًا: «قديم»" })])
    renderPage()
    expect(await screen.findByText("لم يعد هذا المحتوى متاحًا")).toBeTruthy()
    await openItem("نشر المعلم أحمد موردًا: «قديم»")
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/notifications/gone/read") && c.method === "PATCH")).toBe(true))
    expect(toast.error).toHaveBeenCalledWith("لم يعد هذا المحتوى متاحًا.")
    expect(calls.some((c) => c.url.includes("/student/resources/"))).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it("a type this version does not know yet is shown, marked read, and opens nothing", async () => {
    const calls = stubApi([
      dto({ id: "new", type: "CERTIFICATE_ISSUED", title: "شهادة", message: "انضم الطالب سلمى إلى قسمك", entityType: "CERTIFICATE", entityId: "c1" }),
    ])
    renderPage()
    await openItem("انضم الطالب سلمى إلى قسمك")
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/notifications/new/read"))).toBe(true))
    expect(calls.filter((c) => !c.url.includes("/notifications"))).toEqual([])
    expect(push).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("an available one still opens its content (an API without `available` counts as available)", async () => {
    const { available: _drop, ...older } = dto({ id: "ok" })
    void _drop
    const calls = stubApi([older as NotificationDto])
    renderPage()
    await openItem("نشر المعلم أحمد بن علي موردًا جديدًا: «تجويد»")
    await waitFor(() => expect(push).toHaveBeenCalledWith("/student/resources/r1"))
    expect(calls.some((c) => c.url.endsWith("/student/resources/r1"))).toBe(true)
    expect(screen.queryByText("لم يعد هذا المحتوى متاحًا")).toBeNull()
  })
})

describe("notifications: requests sent to the admins", () => {
  const registration = dto({
    id: "reg",
    type: "REGISTRATION_REQUEST_SUBMITTED",
    title: "طلب تسجيل جديد",
    message: "وصل طلب تسجيل جديد من الموقع باسم سلمى المؤدب.",
    entityType: "REGISTRATION_REQUEST",
    entityId: "rq1",
  })
  const onboarding = dto({
    id: "onb",
    type: "ONBOARDING_SUBMITTED",
    title: "طلب استكمال جديد",
    message: "أرسلت الطالبة مريم بياناتها عبر رابط الاستكمال لقسم الماهر — المركز.",
    entityType: "ONBOARDING_SUBMISSION",
    entityId: "sb1",
  })

  it("a registration request opens its page, after reading it", async () => {
    const calls = stubApi([registration])
    renderPage("admin")
    await openItem(registration.message)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/registration-requests/rq1"))
    expect(calls.some((c) => c.url.endsWith("/admin/registration-requests/rq1"))).toBe(true)
  })

  it("an onboarding submission opens the submissions list with it open", async () => {
    const calls = stubApi([onboarding])
    renderPage("admin")
    await openItem(onboarding.message)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/student-onboarding/submissions?id=sb1"))
    expect(calls.some((c) => c.url.endsWith("/admin/student-onboarding/submissions/sb1"))).toBe(true)
  })

  it("outside the admin space (an admin who also teaches) they open nothing", () => {
    for (const n of [registration, onboarding]) {
      const notification = { ...n, userId: "u1", isRead: false, entityType: n.entityType!, entityId: n.entityId!, createdAt: "2026-10-26" }
      expect(notificationHref(notification, "teacher")).toBeUndefined()
      expect(notificationHref(notification, "student")).toBeUndefined()
    }
  })
})

describe("notifications: students joining, moving and leaving classes", () => {
  const joined = dto({
    id: "j",
    type: "STUDENT_JOINED_CLASS",
    title: "طالب جديد في القسم",
    message: "أضاف المسؤول الإداري أحمد بن علي الطالب سامي القاسمي إلى قسم الماهر — فرع المركز.",
    entityType: "STUDENT",
    entityId: "st1",
  })
  const left = dto({
    id: "l",
    type: "STUDENT_LEFT_CLASS",
    title: "مغادرة طالب",
    message: "غادر الطالب سامي القاسمي قسم الماهر — فرع المركز بعد نقله من طرف المسؤول الإداري أحمد بن علي.",
    entityType: "GROUP_CLASS",
    entityId: "c1",
  })

  it("a teacher opens a student of their classes, after checking it is still theirs", async () => {
    const calls = stubApi([joined], { students: [{ id: "st1" }], groupClasses: [] })
    renderPage("teacher")
    await openItem(joined.message)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/teacher/students/st1"))
    expect(calls.some((c) => c.url.endsWith("/teacher/workspace"))).toBe(true)
  })

  it("a student no longer in the teacher’s classes is not opened", async () => {
    const calls = stubApi([joined], { students: [{ id: "someone-else" }], groupClasses: [] })
    renderPage("teacher")
    await openItem(joined.message)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("لم يعد هذا المحتوى متاحًا لحسابك."))
    expect(calls.some((c) => c.url.endsWith("/teacher/workspace"))).toBe(true)
    expect(push).not.toHaveBeenCalled()
  })

  it("a departure opens the teacher’s class", async () => {
    stubApi([left], { students: [], groupClasses: [{ id: "c1" }] })
    renderPage("teacher")
    await openItem(left.message)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/teacher/classes/c1"))
  })

  it("a deleted student opens nothing", async () => {
    const calls = stubApi([{ ...joined, available: false }])
    renderPage("teacher")
    await openItem(joined.message)
    expect(await screen.findByText("لم يعد هذا المحتوى متاحًا")).toBeTruthy()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("لم يعد هذا المحتوى متاحًا."))
    expect(calls.some((c) => c.url.endsWith("/teacher/workspace"))).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it("in the admin space a student opens the admin profile; elsewhere nothing opens", () => {
    const n = { ...joined, userId: "u1", isRead: false, entityType: "STUDENT", entityId: "st1", createdAt: "2026-10-26" }
    expect(notificationHref(n, "admin")).toBe("/admin/students/st1")
    expect(notificationHref(n, "student")).toBeUndefined()
    const c = { ...n, entityType: "GROUP_CLASS", entityId: "c1" }
    expect(notificationHref(c, "teacher")).toBe("/teacher/classes/c1")
    // A student: the schedule of their class (checked against their workspace first)
    expect(notificationHref(c, "student")).toBe("/student/schedule")
  })

  it("an admin who also teaches opens a class from the admin space on its group's page, after the admin API answers", async () => {
    const calls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url.includes("/notifications/unread-count")) return json(200, { count: 1 })
        if (/\/notifications\?/.test(url)) return json(200, { data: [left], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } })
        // GroupClassDetailDto: the group as a reference
        if (url.endsWith("/admin/group-classes/c1")) return json(200, { id: "c1", group: { id: "g1", name: "الماهر" } })
        return json(200, {})
      })
    )
    renderPage("admin")
    await openItem(left.message)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/groups/g1#group-classes"))
    expect(calls.some((u) => u.endsWith("/teacher/workspace"))).toBe(false)
  })

  it("from the admin space, a class the API refuses is not opened", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes("/notifications/unread-count")) return json(200, { count: 1 })
        if (/\/notifications\?/.test(url)) return json(200, { data: [left], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } })
        if (url.endsWith("/admin/group-classes/c1")) return json(404, { statusCode: 404, code: "GROUP_CLASS_NOT_FOUND", message: "القسم غير موجود" })
        return json(200, {})
      })
    )
    renderPage("admin")
    await openItem(left.message)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("لم يعد هذا المحتوى متاحًا لحسابك."))
    expect(push).not.toHaveBeenCalled()
  })
})

describe("notificationHref", () => {
  const n = (over: Partial<UserNotification>): UserNotification => ({
    id: "n1", userId: "u1", type: "ANNOUNCEMENT_PUBLISHED", title: "إعلان جديد", message: "…",
    entityType: "ANNOUNCEMENT", entityId: "a1", isRead: false, createdAt: "2026-10-26", ...over,
  })
  it("links known subjects, never a deleted one nor an unknown one", () => {
    expect(notificationHref(n({}), "teacher")).toBe("/teacher/announcements/a1")
    expect(notificationHref(n({ available: false }), "teacher")).toBeUndefined()
    expect(notificationHref(n({ entityType: "GROUP_CLASS" }), "admin")).toBeUndefined()
    expect(notificationHref(n({ entityType: undefined, entityId: undefined }), "admin")).toBeUndefined()
  })
})

describe("notifications: groups, classes and lessons changed by an admin", () => {
  /** The list answers with `items`; the routes in `answers` with their response; the rest {} */
  function stub(items: NotificationDto[], answers: Record<string, () => Response>) {
    const calls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url.includes("/notifications/unread-count")) return json(200, { count: items.length })
        if (/\/notifications\?/.test(url)) return json(200, { data: items, meta: { page: 1, pageSize: 20, total: items.length, totalPages: 1 } })
        const hit = Object.keys(answers).find((path) => url.endsWith(path))
        return hit ? answers[hit]() : json(200, {})
      })
    )
    return calls
  }
  const lesson = dto({
    id: "s",
    type: "SESSION_CHANGED",
    title: "إلغاء حصة",
    message: "ألغى المسؤول الإداري أحمد بن علي حصة قسم الماهر — فرع المركز: يوم الأحد.",
    entityType: "SESSION",
    entityId: "se1",
  })
  const group = dto({ id: "g", type: "GROUP_CHANGED", title: "تعديل على المجموعة", message: "عدّل المسؤول الإداري أحمد مجموعة الماهر.", entityType: "GROUP", entityId: "g1" })
  const schedule = dto({ id: "c", type: "CLASS_CHANGED", title: "تعديل المواعيد", message: "عدّل المسؤول الإداري أحمد مواعيد قسم الماهر.", entityType: "GROUP_CLASS", entityId: "c1" })

  it("a teacher opens a changed lesson's page, after the API lets them", async () => {
    const calls = stub([lesson], { "/teacher/sessions/se1": () => json(200, { id: "se1" }) })
    renderPage("teacher")
    await openItem(lesson.message)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/teacher/sessions/se1"))
    expect(calls.some((u) => u.endsWith("/teacher/sessions/se1"))).toBe(true)
  })

  it("a lesson the teacher no longer belongs to (403) is not opened", async () => {
    stub([lesson], { "/teacher/sessions/se1": () => json(403, { statusCode: 403, code: "FORBIDDEN", message: "غير مسموح" }) })
    renderPage("teacher")
    await openItem(lesson.message)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("لم يعد هذا المحتوى متاحًا لحسابك."))
    expect(push).not.toHaveBeenCalled()
  })

  it("a student opens their schedule; an attendance change still opens the attendance page", async () => {
    stub([lesson], {})
    renderPage("student")
    await openItem(lesson.message)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/student/schedule"))
    const attendance = { id: "a", userId: "u1", type: "ATTENDANCE_MODIFIED", title: "t", message: "m", entityType: "SESSION", entityId: "se1", isRead: false, createdAt: "2026-10-27" }
    expect(notificationHref(attendance, "teacher")).toBe("/teacher/sessions/se1/attendance")
    expect(notificationHref({ ...attendance, type: "SESSION_CHANGED" }, "admin")).toBe("/admin/sessions/se1")
  })

  it("a group: the admin page; for a teacher, their classes while the group has one of theirs", async () => {
    expect(notificationHref({ ...group, userId: "u1", isRead: false, entityType: "GROUP", entityId: "g1", createdAt: "2026-10-27" }, "admin")).toBe("/admin/groups/g1")
    stub([group], { "/teacher/workspace": () => json(200, { groups: [{ id: "g9" }], groupClasses: [], students: [] }) })
    renderPage("teacher")
    await openItem(group.message)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("لم يعد هذا المحتوى متاحًا لحسابك."))
    expect(push).not.toHaveBeenCalled()
  })

  it("a student's class schedule change opens their schedule when the class is theirs", async () => {
    const calls = stub([schedule], { "/student/workspace": () => json(200, { groupClasses: [{ id: "c1" }] }) })
    renderPage("student")
    await openItem(schedule.message)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/student/schedule"))
    expect(calls.some((u) => u.endsWith("/student/workspace"))).toBe(true)
  })
})
