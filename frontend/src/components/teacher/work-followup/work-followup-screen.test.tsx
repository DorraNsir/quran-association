import { fireEvent, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { WorkFollowupProvider } from "./work-followup-provider"
import { WorkFollowupScreen } from "./work-followup-screen"
import { WorkProgramDetails } from "./work-program-details"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// No API in the prototype: any shared component's request just gets a 404
vi.stubGlobal("fetch", vi.fn(async () => json(404, { code: "NOT_FOUND" })))

const renderIn = (ui: React.ReactNode) =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <WorkFollowupProvider>{ui}</WorkFollowupProvider>
    </DirectionProvider>
  )

/** The card of a student whose header shows `phase` («قادمة» / «سابقة»). */
const cardOf = (name: string, phase: string) =>
  screen
    .getAllByText(name)
    .map((el) => el.closest("[data-slot=card]") as HTMLElement)
    .find((card) => card && within(card).queryByText(phase))!

describe("«متابعة العمل» — list (compact cards)", () => {
  it("one clickable card per student and session, previewing two items and counting the rest", () => {
    renderIn(<WorkFollowupScreen />)
    const card = cardOf("درة نصير", "قادمة")
    expect(within(card).getByRole("link", { name: /برنامج عمل درة نصير/ }).getAttribute("href")).toBe("/teacher/work-followup/wf-p2")
    expect(within(card).getByRole("link", { name: /عرض تفاصيل البرنامج/ }).getAttribute("href")).toBe("/teacher/work-followup/wf-p2")
    const preview = within(card).getAllByRole("listitem")
    expect(preview).toHaveLength(2)
    expect(preview[0].textContent).toContain("مراجعة من سورة الزمر إلى سورة الناس")
    expect(within(card).getByText("+ 2 أعمال أخرى")).toBeTruthy()
    // Two-line clamp that also wraps unbroken strings (visual only)
    expect(within(preview[0]).getByText(/مراجعة من سورة الزمر/).className).toMatch(/line-clamp-2.*\[overflow-wrap:anywhere\]/)
  })

  it("a program with two items shows no «more» line", () => {
    renderIn(<WorkFollowupScreen />)
    const card = cardOf("مريم بن عمر", "سابقة")
    expect(within(card).getAllByRole("listitem")).toHaveLength(2)
    expect(within(card).queryByText(/أعمال أخرى|عمل آخر/)).toBeNull()
  })

  it("cancelled work is shown apart and left out of the active total", () => {
    renderIn(<WorkFollowupScreen />)
    const card = cardOf("أحمد محمد", "سابقة")
    expect(within(card).getByText("1 من 2 أعمال نشطة منجزة")).toBeTruthy()
    expect(within(card).getByText(/عمل ملغى واحد/)).toBeTruthy()
  })

  it("period tabs: past sessions only", () => {
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(screen.getByRole("tab", { name: "الحصص السابقة" }))
    expect(screen.queryAllByText("قادمة")).toHaveLength(0)
    expect(screen.getAllByText("سابقة").length).toBeGreaterThan(0)
  })

  it("evaluating from a card updates its progress (the six results, «ملغى» included)", () => {
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(within(cardOf("درة نصير", "قادمة")).getByRole("button", { name: "تقييم الأعمال" }))
    const sheet = screen.getByRole("dialog")
    const group = within(sheet).getByRole("radiogroup", { name: /مراجعة من سورة الزمر/ })
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["لم يُقيّم بعد", "منجز", "غير منجز", "جزئي", "مؤجل", "ملغى"])
    fireEvent.click(within(group).getByRole("radio", { name: "منجز" }))
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ التقييم" }))
    expect(within(cardOf("درة نصير", "قادمة")).getByText("1 من 4 أعمال منجزة")).toBeTruthy()
  })

  it("the description field is a multiline textarea, one per work item", () => {
    renderIn(<WorkFollowupScreen />)
    fireEvent.click(within(cardOf("درة نصير", "قادمة")).getByRole("button", { name: "تعديل البرنامج" }))
    const sheet = screen.getByRole("dialog")
    const fields = within(sheet).getAllByLabelText("وصف العمل")
    expect(fields).toHaveLength(4)
    expect(fields.every((f) => f.tagName === "TEXTAREA")).toBe(true)
    expect((fields[1] as HTMLTextAreaElement).value).toBe("إكمال العرضة الثانية من سورة التوبة")
    fireEvent.click(within(sheet).getByRole("button", { name: "إضافة عمل آخر" }))
    expect(within(sheet).getAllByLabelText("وصف العمل")).toHaveLength(5)
  })
})

describe("«متابعة العمل» — program page", () => {
  it("shows every item in full (never clamped), with the line breaks kept", () => {
    renderIn(<WorkProgramDetails programId="wf-p6" />)
    expect(screen.getByRole("heading", { name: "برنامج عمل مريم بن عمر" })).toBeTruthy()
    const full = screen.getByText(/حفظ الربع الأول من سورة الكهف/)
    expect(full.textContent).toContain("\n")
    expect(full.className).toMatch(/whitespace-pre-wrap/)
    expect(full.className).not.toMatch(/line-clamp/)
  })

  it("shows where a carried item came from", () => {
    renderIn(<WorkProgramDetails programId="wf-p2" />)
    expect(screen.getAllByText(/منقول من حصة سابقة: .* — مؤجل/).length).toBe(1)
  })

  it("a cancelled item can be carried to an upcoming session; the original stays «ملغى»", () => {
    renderIn(<WorkProgramDetails programId="wf-p7" />)
    const cancelled = screen.getByText("العرضة الأولى من سورة الملك").closest("li")!
    expect(within(cancelled).getByText("ملغى")).toBeTruthy()
    fireEvent.click(within(cancelled).getByRole("button", { name: "نقل إلى الحصة القادمة" }))
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "تأكيد" }))
    const after = screen.getByText("العرضة الأولى من سورة الملك").closest("li")!
    expect(within(after).getByText("ملغى")).toBeTruthy()
    expect(within(after).getByText(/نُقل إلى حصة/)).toBeTruthy()
  })

  it("an unknown program id shows a not-found state with a way back", () => {
    renderIn(<WorkProgramDetails programId="nope" />)
    expect(screen.getByText("برنامج العمل غير موجود")).toBeTruthy()
    expect(screen.getByRole("link", { name: "العودة إلى متابعة العمل" }).getAttribute("href")).toBe("/teacher/work-followup")
  })
})
