import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { schoolYearStart } from "@/lib/api/student-onboarding"
import { todayInTunis } from "@/lib/dates"

import { ReviewSheet } from "./admin-onboarding-submissions"
import { PublicOnboardingForm } from "./public-onboarding-form"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Object URLs for photo previews (Node's own implementation rejects jsdom's File)
URL.createObjectURL = () => "blob:photo"
URL.revokeObjectURL = () => {}
// jsdom lacks what Radix Select calls when an option list opens
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}

const TOKEN = "A".repeat(43)
type Call = { method: string; path: string; body?: Record<string, unknown> }

function routeFetch(handler: (c: Call) => Response | undefined) {
  const calls: Call[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const raw = init?.body
      const body = raw instanceof FormData ? Object.fromEntries(raw.entries()) : raw ? JSON.parse(String(raw)) : undefined
      const call = { method: init?.method ?? "GET", path: url.pathname.replace(/^\/api/, ""), body }
      calls.push(call)
      return handler(call) ?? json(404, { code: "NOT_FOUND" })
    })
  )
  return calls
}

const rtl = (ui: React.ReactNode) => renderWithClient(<DirectionProvider dir="rtl">{ui}</DirectionProvider>)

beforeEach(() => clearSession())

describe("public form /student-info/[token]", () => {
  it("expired link → the expiry message, no form", async () => {
    routeFetch(() => json(410, { code: "ONBOARDING_LINK_EXPIRED", message: "انتهت صلاحية رابط استكمال البيانات. يرجى التواصل مع إدارة الجمعية." }))
    rtl(<PublicOnboardingForm token={TOKEN} />)
    expect(await screen.findByText("انتهت صلاحية رابط استكمال البيانات. يرجى التواصل مع إدارة الجمعية.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "إرسال البيانات" })).toBeNull()
  })

  it("invalid / revoked link → invalid message", async () => {
    routeFetch(() => json(404, { code: "ONBOARDING_LINK_INVALID" }))
    rtl(<PublicOnboardingForm token={TOKEN} />)
    expect(await screen.findByText("رابط غير صالح")).toBeTruthy()
  })

  it("shows the class read-only, no account fields; the token goes in the body and no class is sent", async () => {
    const calls = routeFetch(({ path }) => {
      if (path === "/public/student-onboarding/resolve") return json(200, { branchName: "فرع المنزه", groupName: "مجموعة الأمل", supervisorName: "سارة" })
      if (path === "/public/student-onboarding/submissions") return json(201, { received: true })
    })
    rtl(<PublicOnboardingForm token={TOKEN} />)
    expect(await screen.findByText("استكمال بيانات الطالب")).toBeTruthy()
    expect(screen.getByText("يرجى تعمير البيانات التالية لاستكمال تسجيلك في منظومة الجمعية.")).toBeTruthy()
    expect(screen.getByText("فرع المنزه")).toBeTruthy()
    expect(screen.getByText("قسم سارة")).toBeTruthy()
    expect(document.querySelector("input[type=password]")).toBeNull()
    expect(screen.queryByLabelText(/اسم المستخدم|كلمة المرور/)).toBeNull()
    expect(calls[0]).toMatchObject({ method: "POST", body: { token: TOKEN } })
    expect(calls[0].path).not.toContain(TOKEN)

    // Required checks: submitter, consent, minor ⇒ guardian phone
    fireEvent.change(screen.getByLabelText(/^الاسم/), { target: { value: "  يوسف " } })
    fireEvent.change(screen.getByLabelText(/^اللقب/), { target: { value: "بن علي" } })
    fireEvent.change(screen.getByLabelText(/تاريخ الولادة/), { target: { value: "2014-05-01" } })
    fireEvent.click(screen.getByRole("combobox", { name: /الجنس/ }))
    fireEvent.click(await screen.findByRole("option", { name: "ذكر" }))
    fireEvent.change(screen.getByLabelText(/العنوان/), { target: { value: "تونس" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال البيانات" }))
    expect(await screen.findByText("حدّد من يملأ الاستمارة")).toBeTruthy()
    expect(calls.some((c) => c.path.endsWith("/submissions"))).toBe(false)

    fireEvent.click(screen.getByRole("radio", { name: "الولي" }))
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.change(screen.getByLabelText(/هاتف الولي/), { target: { value: "22 123 456" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال البيانات" }))
    expect(await screen.findByText("تم إرسال بياناتك بنجاح. ستقوم إدارة الجمعية بمراجعتها.")).toBeTruthy()
    const sent = calls.find((c) => c.path === "/public/student-onboarding/submissions")!.body!
    expect(sent).toMatchObject({ token: TOKEN, submittedBy: "GUARDIAN", consent: true, firstName: "يوسف", gender: "MALE", dateOfBirth: "2014-05-01", phone: null })
    expect(sent).not.toHaveProperty("groupClassId")
    expect(sent).not.toHaveProperty("password")
  })
})

describe("public form — photo", () => {
  it("an optional photo is sent with the form (multipart: data + photo)", async () => {
    const calls = routeFetch(({ path }) => {
      if (path === "/public/student-onboarding/resolve") return json(200, { branchName: "ف", groupName: "م", supervisorName: null })
      if (path === "/public/student-onboarding/submissions") return json(201, { received: true })
    })
    rtl(<PublicOnboardingForm token={TOKEN} />)
    await screen.findByText("استكمال بيانات الطالب")
    const input = screen.getByLabelText("صورة شمسية") as HTMLInputElement
    // Not an image → refused before anything is sent
    fireEvent.change(input, { target: { files: [new File(["x"], "doc.pdf", { type: "application/pdf" })] } })
    expect(screen.getByText("الصيغ المقبولة: JPG أو PNG أو WebP.")).toBeTruthy()
    const photo = new File([new Uint8Array([137, 80, 78, 71])], "me.png", { type: "image/png" })
    fireEvent.change(input, { target: { files: [photo] } })

    fireEvent.click(screen.getByRole("radio", { name: "الطالب نفسه" }))
    fireEvent.change(screen.getByLabelText(/^الاسم/), { target: { value: "سارة" } })
    fireEvent.change(screen.getByLabelText(/^اللقب/), { target: { value: "التونسي" } })
    fireEvent.change(screen.getByLabelText(/تاريخ الولادة/), { target: { value: "2000-01-15" } })
    fireEvent.click(screen.getByRole("combobox", { name: /الجنس/ }))
    fireEvent.click(await screen.findByRole("option", { name: "أنثى" }))
    fireEvent.change(screen.getByLabelText(/هاتف الطالب/), { target: { value: "55443322" } })
    fireEvent.change(screen.getByLabelText(/العنوان/), { target: { value: "سوسة" } })
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: "إرسال البيانات" }))
    await screen.findByText("تم إرسال بياناتك بنجاح. ستقوم إدارة الجمعية بمراجعتها.")
    const sent = calls.find((c) => c.path === "/public/student-onboarding/submissions")!.body as Record<string, unknown>
    expect(sent.photo).toBeInstanceOf(File)
    expect((sent.photo as File).name).toBe("me.png")
    const data = JSON.parse(String(sent.data))
    expect(data).toMatchObject({ token: TOKEN, submittedBy: "STUDENT", firstName: "سارة", gender: "FEMALE" })
    expect(data).not.toHaveProperty("groupClassId")
  })
})

const detail = (over: object = {}) => ({
  id: "s1",
  version: 2,
  status: "PENDING",
  submittedBy: "GUARDIAN",
  firstName: "يوسف",
  lastName: "بن علي",
  gender: "MALE",
  dateOfBirth: "2014-05-01",
  address: "تونس",
  phone: null,
  email: null,
  guardianPhone: "22123456",
  cin: null,
  groupClass: { id: "c1", group: { id: "g1", name: "مجموعة الأمل" }, branch: { id: "b1", name: "فرع المنزه" }, supervisorName: "سارة" },
  createdAt: "2026-10-17T09:00:00.000Z",
  reviewedAt: null,
  reviewedBy: null,
  rejectionReason: null,
  approvedStudentId: null,
  linkedExisting: false,
  edited: false,
  hasPhoto: false,
  originalData: {},
  possibleMatches: [],
  ...over,
})

describe("admin review drawer", () => {
  beforeEach(() => setSession(authResponse("admin", ["ADMIN"])))

  it("possible duplicate → warning with view / link / create-after-confirmation", async () => {
    const match = { studentId: "st9", firstName: "يوسف", lastName: "بن علي", dateOfBirth: "2014-05-01", guardianPhone: "22123456", groupClassLabel: "مجموعة الأمل", reasons: ["NAME", "GUARDIAN_PHONE"] }
    const calls = routeFetch(({ method, path }) => {
      if (method === "GET" && path === "/admin/student-onboarding/submissions/s1") return json(200, detail({ possibleMatches: [match] }))
      if (path.endsWith("/approve")) return json(200, detail({ status: "APPROVED", approvedStudentId: "new" }))
    })
    const onClose = vi.fn()
    rtl(<ReviewSheet id="s1" onClose={onClose} />)
    expect(await screen.findByText("قد يكون هذا الطالب مسجلاً مسبقاً في المنظومة.")).toBeTruthy()
    expect(screen.getByRole("link", { name: /عرض الطالب الموجود/ }).getAttribute("href")).toBe("/admin/students/st9")
    expect(screen.getByRole("button", { name: /ربط بالطالب الموجود/ })).toBeTruthy()
    expect(screen.getByText("نفس هاتف الولي")).toBeTruthy()

    // Approving needs an explicit confirmation, then sends confirmNoDuplicate + version
    fireEvent.click(screen.getByRole("button", { name: /قبول وإضافة الطالب/ }))
    const confirm = await screen.findByRole("alertdialog")
    expect(calls.some((c) => c.path.endsWith("/approve"))).toBe(false)
    fireEvent.click(within(confirm).getByRole("button", { name: "إنشاء طالب جديد بعد التأكيد" }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    // Registration date: 1 September of the current school year by default
    expect(calls.find((c) => c.path.endsWith("/approve"))!.body).toMatchObject({
      version: 2,
      confirmNoDuplicate: true,
      registrationDate: schoolYearStart(todayInTunis()),
    })
  })

  it("link to the matched student sends its id", async () => {
    const match = { studentId: "st9", firstName: "يوسف", lastName: "بن علي", dateOfBirth: null, guardianPhone: null, groupClassLabel: null, reasons: ["NAME"] }
    const calls = routeFetch(({ method, path }) => {
      if (method === "GET") return json(200, detail({ possibleMatches: [match] }))
      if (path.endsWith("/link")) return json(200, detail({ status: "APPROVED", approvedStudentId: "st9", linkedExisting: true }))
    })
    rtl(<ReviewSheet id="s1" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: /ربط بالطالب الموجود/ }))
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "ربط بالطالب الموجود" }))
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/link"))?.body).toEqual({ version: 2, studentId: "st9" }))
  })

  it("reject with a reason; no duplicate → no warning", async () => {
    const calls = routeFetch(({ method, path }) => {
      if (method === "GET") return json(200, detail())
      if (path.endsWith("/reject")) return json(200, detail({ status: "REJECTED" }))
    })
    rtl(<ReviewSheet id="s1" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: /رفض الطلب/ }))
    expect(screen.queryByText("قد يكون هذا الطالب مسجلاً مسبقاً في المنظومة.")).toBeNull()
    const dialog = await screen.findByRole("dialog", { name: "رفض الطلب" })
    fireEvent.change(within(dialog).getByLabelText(/سبب الرفض/), { target: { value: "طلب مكرر" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "رفض الطلب" }))
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/reject"))?.body).toEqual({ version: 2, reason: "طلب مكرر" }))
  })

  it("shows the submitted photo (fetched with the admin token)", async () => {
    const calls = routeFetch(({ path }) => {
      if (path.endsWith("/photo")) return new Response(new Blob([new Uint8Array([1])], { type: "image/png" }), { status: 200 })
      return json(200, detail({ hasPhoto: true }))
    })
    rtl(<ReviewSheet id="s1" onClose={() => {}} />)
    expect(await screen.findByRole("img", { name: /صورة يوسف/ })).toBeTruthy()
    expect(calls.some((c) => c.path === "/admin/student-onboarding/submissions/s1/photo")).toBe(true)
  })

  it("a decided request shows no actions", async () => {
    routeFetch(() => json(200, detail({ status: "APPROVED", approvedStudentId: "st1" })))
    rtl(<ReviewSheet id="s1" onClose={() => {}} />)
    expect(await screen.findByRole("link", { name: /عرض الطالب المضاف/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /قبول وإضافة الطالب/ })).toBeNull()
  })
})
