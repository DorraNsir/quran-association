import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChangeGroupDialog } from "@/components/students/change-group-dialog"
import { DirectionProvider } from "@/components/ui/direction"
import { toObligationRow, type ObligationDto } from "@/lib/api/finance"
import { clearSession, setSession } from "@/lib/api/session"
import type { Lookups } from "@/lib/domain"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"
import type { Group, Student } from "@/types/domain"

import { ObligationFigures } from "./payment-parts"
import { GroupFees, repriceSentence } from "./payments-views"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/lib/store/settings", async (importOriginal) => {
  const years = [
    {
      id: "y1", label: "2026-2027", isCurrent: true, startDate: "2026-09-14", endDate: "2027-06-30",
      semesters: { SEMESTER_1: { startDate: "2026-09-14", endDate: "2027-01-31" }, SEMESTER_2: { startDate: "2027-02-01", endDate: "2027-06-30" } },
    },
    {
      id: "y2", label: "2027-2028", isCurrent: false, startDate: "2027-09-13", endDate: "2028-06-30",
      semesters: { SEMESTER_1: { startDate: "2027-09-13", endDate: "2028-01-31" }, SEMESTER_2: { startDate: "2028-02-01", endDate: "2028-06-30" } },
    },
  ]
  return {
    ...(await importOriginal<typeof import("@/lib/store/settings")>()),
    useAcademicYears: () => years,
    useCurrentAcademicYear: () => years[0],
    usePlatformSettings: () => ({ defaultPageSize: 10 }),
  }
})
Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}

const group: Group = { id: "g1", name: "الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" }
const fee = (over: object) => ({
  id: "f2",
  group: { id: "g1", name: "الماهر" },
  academicYear: { id: "y1", label: "2026-2027" },
  label: "معلوم السنة",
  billingType: "YEARLY",
  amount: "200.000",
  numberOfPeriods: 1,
  totalAmount: "200.000",
  currency: "TND",
  startDate: null,
  endDate: null,
  isActive: true,
  status: "ACTIVE",
  createdAt: "2026-10-20T08:00:00Z",
  deactivatedAt: null,
  obligationsCount: 3,
  ...over,
})
const VERSIONS = [
  fee({}),
  fee({ id: "f1", amount: "120.000", totalAmount: "120.000", isActive: false, status: "REPLACED", createdAt: "2026-09-15T08:00:00Z", deactivatedAt: "2026-10-20T08:00:00Z" }),
]
const student = (first: string) => ({ id: `s-${first}`, firstName: first, lastName: "التونسي" })
const PREVIEW = {
  currentFee: fee({}),
  newTotalAmount: "250.000",
  toUpdate: [{ obligationId: "o-ahmed", student: student("أحمد"), currentAmount: "200.000", newAmount: "250.000" }],
  protected: [
    { obligationId: "o-mariem", student: student("مريم"), currentAmount: "200.000", reasons: ["HAS_PAYMENTS"] },
    { obligationId: "o-fatma", student: student("فاطمة"), currentAmount: "200.000", reasons: ["HAS_PAYMENTS"] },
  ],
  unchangedCount: 0,
}

function routeFetch(preview: object = PREVIEW, versions: object[] = VERSIONS) {
  const calls: { method: string; url: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.includes("/reprice-preview")) return json(200, preview)
      if (url.includes("/fees") && init?.method === "PUT") return json(200, fee({}))
      if (url.includes("/deactivate")) return json(200, fee({ isActive: false, status: "STOPPED" }))
      if (url.includes("/groups/g1/fees")) return json(200, { data: versions })
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return calls
}
const renderFees = () =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <GroupFees group={group} today="2026-10-21" />
    </DirectionProvider>
  )

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("«معلوم المجموعة»", () => {
  it("one current fee per year (total per student) — earlier versions under «سجل التعديلات» as «استُبدل»", async () => {
    routeFetch()
    renderFees()
    expect(await screen.findByText("لكل طالب")).toBeTruthy()
    expect(screen.getByRole("button", { name: /تعديل المعلوم/ })).toBeTruthy()
    // Only one current fee is shown with actions; the old version is history
    expect(screen.getAllByRole("button", { name: /تعديل المعلوم/ })).toHaveLength(1)
    const history = screen.getByText(/سجل التعديلات \(1\)/).closest("details")!
    expect(within(history).getByText("استُبدل")).toBeTruthy()
    expect(history.textContent).toMatch(/120.*←.*200/)
    // The year without a fee can get one
    expect(screen.getByRole("button", { name: /تحديد المعلوم/ })).toBeTruthy()
  })

  it("the form keeps only the label, the year (locked when editing) and the total per student", async () => {
    routeFetch()
    renderFees()
    fireEvent.click(await screen.findByRole("button", { name: /تعديل المعلوم/ }))
    const dialog = await screen.findByRole("dialog", { name: "تعديل المعلوم" })
    expect(within(dialog).getByLabelText(/التسمية/)).toBeTruthy()
    expect(within(dialog).getByLabelText(/المبلغ المطلوب لكل طالب/)).toBeTruthy()
    expect(within(dialog).queryByText(/طريقة الدفع/)).toBeNull()
    expect(within(dialog).queryByText(/عدد الأشهر/)).toBeNull()
    expect(within(dialog).queryByRole("combobox")).toBeNull()
    expect(within(dialog).getByText("لا يمكن تغيير السنة الدراسية عند تعديل المعلوم.")).toBeTruthy()
    expect((within(dialog).getByLabelText(/المبلغ المطلوب لكل طالب/) as HTMLInputElement).value).toBe("200")
  })

  it("editing shows the financial impact first, then sends exactly the confirmed obligations", async () => {
    const calls = routeFetch()
    renderFees()
    fireEvent.click(await screen.findByRole("button", { name: /تعديل المعلوم/ }))
    const dialog = await screen.findByRole("dialog", { name: "تعديل المعلوم" })
    fireEvent.change(within(dialog).getByLabelText(/المبلغ المطلوب لكل طالب/), { target: { value: "250" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }))
    const confirm = await screen.findByRole("alertdialog")
    expect(confirm.textContent).toContain(
      "سيتم تحديث المبلغ المطلوب لطالب واحد، بينما ستبقى مستحقات طالبين دون تغيير لوجود دفعات مسجّلة."
    )
    expect(confirm.textContent).toMatch(/المعلوم الحالي: 200 د.ت ← المعلوم الجديد: 250 د.ت/)
    expect(calls.some((c) => c.method === "PUT")).toBe(false)
    fireEvent.click(within(confirm).getByRole("button", { name: "تأكيد وحفظ المعلوم" }))
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true))
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      academicYearId: "y1",
      label: "معلوم السنة",
      amount: "250",
      repriceObligationIds: ["o-ahmed"],
    })
    // No monthly fields sent: the API keeps YEARLY × 1
    expect(calls.find((c) => c.method === "PUT")!.body).not.toHaveProperty("billingType")
  })

  it("nothing affected (a first fee): saved at once, no confirmation", async () => {
    const calls = routeFetch({ ...PREVIEW, currentFee: null, toUpdate: [], protected: [] }, [])
    renderFees()
    fireEvent.click(await screen.findByRole("button", { name: /تحديد المعلوم/ }))
    const dialog = await screen.findByRole("dialog", { name: "تحديد المعلوم" })
    fireEvent.change(within(dialog).getByLabelText(/المبلغ المطلوب لكل طالب/), { target: { value: "120" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }))
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true))
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ amount: "120", repriceObligationIds: [] })
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("«إيقاف» explains its effect before stopping", async () => {
    const calls = routeFetch()
    renderFees()
    fireEvent.click(await screen.findByRole("button", { name: "إيقاف" }))
    const confirm = await screen.findByRole("alertdialog")
    expect(confirm.textContent).toMatch(/المبالغ المسجّلة للطلبة الحاليين ودفعاتهم لا تتغيّر/)
    expect(calls.some((c) => c.url.includes("/deactivate"))).toBe(false)
    fireEvent.click(within(confirm).getByRole("button", { name: "إيقاف المعلوم" }))
    await waitFor(() => expect(calls.some((c) => c.url.includes("/deactivate"))).toBe(true))
  })

  it("repriceSentence: counts and reasons", () => {
    expect(
      repriceSentence({
        toUpdate: Array.from({ length: 8 }, () => PREVIEW.toUpdate[0]),
        protected: Array.from({ length: 3 }, () => PREVIEW.protected[0]) as typeof PREVIEW.protected,
      } as never)
    ).toBe("سيتم تحديث المبلغ المطلوب لـ 8 طلبة، بينما ستبقى مستحقات 3 طلبة دون تغيير لوجود دفعات مسجّلة.")
    expect(
      repriceSentence({
        toUpdate: [],
        protected: [PREVIEW.protected[0], { ...PREVIEW.protected[1], reasons: ["STUDENT_INACTIVE"] }],
      } as never)
    ).toBe("لن يتغيّر المبلغ المطلوب من أي طالب: ستبقى مستحقات طالبين دون تغيير (طالب واحد لوجود دفعات مسجّلة، طالب واحد لأن الطالب غير نشط).")
  })
})

/* ------------------------------ transfers ------------------------------ */

const lookups: Lookups = {
  branches: [{ id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [],
  groups: [
    { id: "gA", name: "أركان", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
    { id: "gB", name: "الماهر", audience: "", status: "ACTIVE", createdAt: "2026-09-01" },
  ],
  groupClasses: [
    { id: "cA", groupId: "gA", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
    { id: "cB", groupId: "gB", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
  ],
  teachers: [{ id: "t1", firstName: "درة", lastName: "ن", phone: "", status: "ACTIVE", joinedAt: "2024-09-01" }],
  schedules: [],
}
const pupil = { id: "st1", firstName: "سلمى", lastName: "المؤدب", groupClassId: "cA", status: "ACTIVE" } as unknown as Student
const PLAN = {
  sameGroup: false,
  targetGroup: { id: "gB", name: "الماهر" },
  transfers: [
    {
      academicYear: { id: "y1", label: "2026-2027" },
      from: { obligationId: "oA", group: { id: "gA", name: "أركان" }, requiredAmount: "120.000", cashPaid: "60.000", creditIn: "0.000", settledAmount: "60.000" },
      to: { group: { id: "gB", name: "الماهر" }, feeId: "fB", requiredAmount: "200.000" },
      creditAmount: "60.000",
      excessAmount: "0.000",
      remainingAfter: "140.000",
      blocked: null,
    },
  ],
}

function renderMove(plan: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => (String(input).includes("/group-class/preview") ? json(200, plan) : json(404, {})))
  )
  const onConfirm = vi.fn(async () => {})
  renderWithClient(
    <DirectionProvider dir="rtl">
      <ChangeGroupDialog open onOpenChange={() => {}} student={pupil} lookups={lookups} onConfirm={onConfirm} />
    </DirectionProvider>
  )
  return onConfirm
}
async function pickClass(dialog: HTMLElement, name: RegExp) {
  fireEvent.click(within(dialog).getByRole("combobox"))
  fireEvent.click(await screen.findByRole("option", { name }))
  const radio = screen.queryByRole("radio", { name: /فرع المركز/ })
  if (radio) fireEvent.click(radio)
}

describe("«تغيير المجموعة» — financial transfer", () => {
  it("shows the four figures, requires an explicit consent, then sends exactly the preview", async () => {
    const onConfirm = renderMove(PLAN)
    const dialog = await screen.findByRole("dialog")
    await pickClass(dialog, /الماهر/)
    const summary = await within(dialog).findByRole("region", { name: "التسوية المالية" })
    const text = summary.textContent!.replace(/\s+/g, " ")
    expect(text).toContain("المبلغ المدفوع سابقًا:60 د.ت")
    expect(text).toContain("الرصيد الذي سيُحوّل:60 د.ت")
    expect(text).toContain("المعلوم في المجموعة الجديدة:200 د.ت")
    expect(text).toContain("المبلغ المتبقي بعد التحويل:140 د.ت")
    const go = within(dialog).getByRole("button", { name: /تأكيد النقل/ }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole("checkbox"))
    expect(go.disabled).toBe(false)
    fireEvent.click(go)
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("cB", [{ fromObligationId: "oA", creditAmount: "60.000" }]))
  })

  it("a group without an active fee: explained, and the move cannot be confirmed", async () => {
    const onConfirm = renderMove({
      ...PLAN,
      transfers: [{ ...PLAN.transfers[0], to: { ...PLAN.transfers[0].to, feeId: null, requiredAmount: null }, blocked: "NO_TARGET_FEE", remainingAfter: null }],
    })
    const dialog = await screen.findByRole("dialog")
    await pickClass(dialog, /الماهر/)
    expect(await within(dialog).findByText(/لا يوجد معلوم ساري لمجموعة «الماهر»/)).toBeTruthy()
    expect((within(dialog).getByRole("button", { name: /تأكيد النقل/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("the same group: no financial change, no consent needed", async () => {
    const onConfirm = renderMove({ sameGroup: true, targetGroup: { id: "gA", name: "أركان" }, transfers: [] })
    const dialog = await screen.findByRole("dialog")
    await pickClass(dialog, /الماهر/)
    expect(await within(dialog).findByText(/لا تتغيّر مستحقات الطالب/)).toBeTruthy()
    expect(within(dialog).queryByRole("checkbox")).toBeNull()
    fireEvent.click(within(dialog).getByRole("button", { name: /تأكيد النقل/ }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("cB", []))
  })
})

describe("student payments: credit, closure, excess", () => {
  const dto = (over: Partial<ObligationDto>): ObligationDto => ({
    id: "o",
    student: { id: "s", firstName: "سلمى", lastName: "المؤدب" },
    group: { id: "gB", name: "الماهر" },
    academicYear: { id: "y1", label: "2026-2027" },
    fee: { id: "f", label: "معلوم", billingType: "YEARLY", amount: "200.000", numberOfPeriods: 1, isActive: true },
    currency: "TND",
    expectedAmount: "200.000",
    requiredAmount: "200.000",
    totalPaid: "0.000",
    creditIn: "60.000",
    creditOut: "0.000",
    remainingAmount: "140.000",
    excessAmount: "0.000",
    status: "PARTIAL",
    paymentsCount: 0,
    receiptsNotIssued: 0,
    note: null,
    createdAt: "2026-10-21T08:00:00Z",
    voided: null,
    closed: null,
    creditsReceived: [{ fromGroup: { id: "gA", name: "أركان" }, amount: "60.000", at: "2026-10-21T08:00:00Z" }],
    ...over,
  })

  it("the new group: required 200, cash 0, credit 60 from «أركان», 140 left", () => {
    const { summary } = toObligationRow(dto({}))
    expect(summary).toMatchObject({ expected: 200, paid: 0, creditIn: 60, remaining: 140 })
    renderWithClient(<ObligationFigures summary={summary} />)
    expect(screen.getByText("رصيد محوّل من مجموعة «أركان»: 60 د.ت")).toBeTruthy()
  })

  it("the old group: closed, released, its excess shown", () => {
    const { summary } = toObligationRow(
      dto({
        group: { id: "gA", name: "أركان" },
        expectedAmount: "120.000",
        requiredAmount: "0.000",
        totalPaid: "120.000",
        creditIn: "0.000",
        creditOut: "100.000",
        remainingAmount: "0.000",
        excessAmount: "20.000",
        status: "CLOSED",
        creditsReceived: [],
        closed: { at: "2026-10-21T08:00:00Z", toGroup: { id: "gE", name: "الأمل" }, creditAmount: "100.000", excessAmount: "20.000" },
      })
    )
    expect(summary).toMatchObject({ expected: 0, paid: 120, remaining: 0, excess: 20, status: "CLOSED" })
    renderWithClient(<ObligationFigures summary={summary} />)
    expect(screen.getByText(/أُغلق بنقل الطالب إلى مجموعة «الأمل» — حُوِّل 100 د.ت رصيدًا/)).toBeTruthy()
    expect(screen.getByText(/رصيد زائد: 20 د.ت/)).toBeTruthy()
  })
})
