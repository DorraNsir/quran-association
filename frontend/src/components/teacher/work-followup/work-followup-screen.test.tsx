import { fireEvent, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { WorkFollowupScreen } from "./work-followup-screen"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// No API in the prototype: any shared component's request just gets a 404
vi.stubGlobal("fetch", vi.fn(async () => json(404, { code: "NOT_FOUND" })))

const renderScreen = () =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <WorkFollowupScreen />
    </DirectionProvider>
  )

/** The card of a student whose header shows `phase` («قادمة» / «سابقة»). */
const cardOf = (name: string, phase: string) =>
  screen
    .getAllByText(name)
    .map((el) => el.closest("[data-slot=card]") as HTMLElement)
    .find((card) => card && within(card).queryByText(phase))!

describe("«متابعة العمل» prototype", () => {
  it("one card per student and session, with all its work items inside", () => {
    renderScreen()
    const upcoming = cardOf("درة نصير", "قادمة")
    const items = within(upcoming).getAllByRole("listitem")
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("مراجعة من سورة الزمر إلى سورة الناس"),
      expect.stringContaining("إكمال العرضة الثانية من سورة التوبة"),
      expect.stringContaining("اختبار من سورة الروم إلى سورة الناس"),
      expect.stringContaining("حفظ صفحتين من سورة البقرة"),
    ])
    expect(within(upcoming).getAllByText("لم يُقيّم بعد")).toHaveLength(4)
    const bar = within(upcoming).getByRole("progressbar", { name: "الأعمال المنجزة" })
    expect([bar.getAttribute("aria-valuenow"), bar.getAttribute("aria-valuemax")]).toEqual(["0", "4"])
    // The carried item shows where it came from; the original keeps its result
    expect(within(upcoming).getByText(/منقول من حصة/)).toBeTruthy()
    const past = cardOf("درة نصير", "سابقة")
    expect(within(past).getByText("مؤجل")).toBeTruthy()
    expect(within(past).getByText(/نُقل إلى حصة/)).toBeTruthy()
  })

  it("period tabs: past sessions only", () => {
    renderScreen()
    fireEvent.click(screen.getByRole("tab", { name: "الحصص السابقة" }))
    expect(screen.queryAllByText("قادمة")).toHaveLength(0)
    expect(screen.getAllByText("سابقة").length).toBeGreaterThan(0)
  })

  it("evaluating one item updates the card’s progress without touching the others", () => {
    renderScreen()
    const card = cardOf("درة نصير", "قادمة")
    fireEvent.click(within(card).getByRole("button", { name: "تقييم الأعمال" }))
    const sheet = screen.getByRole("dialog")
    fireEvent.click(within(within(sheet).getByRole("radiogroup", { name: /مراجعة من سورة الزمر/ })).getByRole("radio", { name: "منجز" }))
    fireEvent.click(within(sheet).getByRole("button", { name: "حفظ التقييم" }))
    const updated = cardOf("درة نصير", "قادمة")
    expect(within(updated).getByRole("progressbar", { name: "الأعمال المنجزة" }).getAttribute("aria-valuenow")).toBe("1")
    expect(within(updated).getAllByText("لم يُقيّم بعد")).toHaveLength(3)
  })
})
