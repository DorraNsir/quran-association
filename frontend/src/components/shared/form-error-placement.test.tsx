import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { Input } from "@/components/ui/input"
import { useFormState } from "@/hooks/use-form-state"
import { toApiError } from "@/lib/api/errors"

import { ConfirmDialog } from "./confirm-dialog"
import { focusFirstInvalid, FormField, FormSection, FormSheet } from "./form"
import { FormErrorAlert } from "./form-error-alert"

const LONG =
  "تعذّر حفظ التعديلات: يوجد تعارض في القاعة والمعلم والقسم في عدة تواريخ متتالية من السنة الدراسية الحالية، ".repeat(8) +
  "يرجى مراجعة البرنامج الأسبوعي ثم إعادة المحاولة."

/** A long sheet (many fields), as in «تعديل الموعد الأسبوعي»: two required fields, then filler. */
function LongSheet({ onSave }: { onSave: (v: { first: string; last: string }) => Promise<unknown> }) {
  const form = useFormState(
    "long",
    { first: "", last: "" },
    (v) => ({ first: v.first ? undefined : "الاسم مطلوب", last: v.last ? undefined : "اللقب مطلوب" })
  )
  return (
    <FormSheet open onOpenChange={() => {}} title="نموذج طويل" onSubmit={form.handleSubmit((v) => onSave(v))} pending={form.pending} error={form.serverError}>
      <FormSection title="البيانات">
        <FormField label="الاسم" required {...form.field("first")}>
          <Input {...form.inputProps("first")} />
        </FormField>
        <FormField label="اللقب" required {...form.field("last")}>
          <Input {...form.inputProps("last")} />
        </FormField>
      </FormSection>
      {Array.from({ length: 12 }, (_, i) => (
        <FormSection key={i} title={`قسم ${i + 1}`}>
          <p>…</p>
        </FormSection>
      ))}
    </FormSheet>
  )
}
const renderSheet = (onSave = vi.fn(async () => {})) => {
  render(
    <DirectionProvider dir="rtl">
      <LongSheet onSave={onSave} />
    </DirectionProvider>
  )
  return onSave
}
const fill = () => {
  fireEvent.change(screen.getByLabelText(/الاسم/), { target: { value: "أنس" } })
  fireEvent.change(screen.getByLabelText(/اللقب/), { target: { value: "التونسي" } })
}
const saveButton = () => screen.getByRole("button", { name: "حفظ" })
/** The sheet's scrolling body (fields) and the fixed bottom area (error + buttons) */
const scrollBody = () => screen.getByLabelText(/الاسم/).closest(".overflow-y-auto")!

describe("form-level errors next to the action buttons", () => {
  it("an API error after «حفظ» appears once, right above the buttons, outside the scrolling body", async () => {
    renderSheet(vi.fn(async () => {
      throw toApiError(409, { code: "ROOM_SCHEDULE_CONFLICT", message: "القاعة محجوزة في هذا الوقت" })
    }))
    fill()
    fireEvent.click(saveButton())
    const alert = (await screen.findByText("القاعة محجوزة في هذا الوقت")).closest("[data-form-error]")!
    expect(alert.getAttribute("role")).toBe("alert")
    expect(alert.getAttribute("aria-live")).toBe("assertive")
    // Not inside the part that scrolls; in the fixed area with the buttons, before them
    expect(scrollBody().contains(alert)).toBe(false)
    expect(alert.parentElement!.contains(saveButton())).toBe(true)
    expect(alert.compareDocumentPosition(saveButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelectorAll("[data-form-error]")).toHaveLength(1)
  })

  it("a long Arabic message wraps and scrolls inside the alert; the buttons stay below it", async () => {
    renderSheet(vi.fn(async () => {
      throw toApiError(400, { code: "X", message: LONG })
    }))
    fill()
    fireEvent.click(saveButton())
    const text = await screen.findByText(LONG)
    expect(text.className).toMatch(/max-h-32/)
    expect(text.className).toMatch(/overflow-y-auto/)
    expect(text.className).toMatch(/break-words/)
    expect(saveButton()).toBeTruthy()
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeTruthy()
  })

  it("validation errors stay under their fields (no form-level alert); the first one is focused, wherever the form is scrolled", async () => {
    const onSave = renderSheet()
    scrollBody().scrollTop = 2000
    fireEvent.click(saveButton())
    // Both field errors, each in its own field
    const first = screen.getByText("الاسم مطلوب")
    const last = screen.getByText("اللقب مطلوب")
    expect(first.closest("[data-slot=field]")!.contains(screen.getByLabelText(/الاسم/))).toBe(true)
    expect(last.closest("[data-slot=field]")!.contains(screen.getByLabelText(/اللقب/))).toBe(true)
    expect(document.activeElement).toBe(screen.getByLabelText(/الاسم/))
    expect(document.querySelectorAll("[data-form-error]")).toHaveLength(0)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("a successful save is unchanged: saved once, no alert", async () => {
    const onSave = renderSheet()
    fill()
    fireEvent.click(saveButton())
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ first: "أنس", last: "التونسي" }))
    expect(document.querySelectorAll("[data-form-error]")).toHaveLength(0)
  })

  it("the error clears on the next attempt and never duplicates", async () => {
    let fail = true
    renderSheet(vi.fn(async () => {
      if (fail) throw toApiError(409, { code: "X", message: "تعارض" })
    }))
    fill()
    fireEvent.click(saveButton())
    await screen.findByText("تعارض")
    fireEvent.click(saveButton())
    await screen.findByText("تعارض")
    expect(document.querySelectorAll("[data-form-error]")).toHaveLength(1)
    fail = false
    fireEvent.click(saveButton())
    await waitFor(() => expect(document.querySelectorAll("[data-form-error]")).toHaveLength(0))
  })

  it("confirmation dialogs: the error sits between the text and the buttons", async () => {
    render(
      <DirectionProvider dir="rtl">
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="تأكيد"
          description="هل تريد المتابعة؟"
          confirmLabel="تأكيد"
          onConfirm={() => Promise.reject(toApiError(409, { code: "X", message: "تعذّر الحفظ" }))}
        />
      </DirectionProvider>
    )
    const dialog = screen.getByRole("alertdialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد" }))
    const alert = (await within(dialog).findByText("تعذّر الحفظ")).closest("[data-form-error]")!
    expect(alert.compareDocumentPosition(within(dialog).getByRole("button", { name: "تأكيد" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(dialog.querySelectorAll("[data-form-error]")).toHaveLength(1)
  })

  it("FormErrorAlert renders nothing without a message", () => {
    const { container } = render(<FormErrorAlert message={null} />)
    expect(container.innerHTML).toBe("")
  })
})

describe("forms without a fixed footer", () => {
  it("focusFirstInvalid: after a refused submit, the first invalid field is focused (scrolled into view)", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] })
    const { container } = render(
      <form>
        <FormField id="ok" label="صالح">
          <Input id="ok" />
        </FormField>
        <FormField id="bad" label="خاطئ" error="حقل مطلوب">
          <Input id="bad" />
        </FormField>
        <FormField id="bad2" label="خاطئ 2" error="حقل مطلوب">
          <Input id="bad2" />
        </FormField>
      </form>
    )
    focusFirstInvalid(container.querySelector("form"))
    act(() => vi.advanceTimersToNextFrame())
    expect(document.activeElement?.id).toBe("bad")
    vi.useRealTimers()
  })
})
