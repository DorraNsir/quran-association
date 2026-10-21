import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { focusFirstInvalid } from "@/components/shared/form"
import { toRequestBody } from "@/lib/api/hooks/registration"

import { useRegistrationForm } from "./registration-form"

/** The shared applicant fields (public form and admin «إضافة طلب») in a minimal harness. */
function Harness({ onCollect }: { onCollect: (fields: unknown) => void }) {
  const form = useRegistrationForm("2026-10-15")
  return (
    <div>
      {form.fields("reg", "self")}
      <button type="button" onClick={() => onCollect(form.collect())}>إرسال</button>
    </div>
  )
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^الاسم/), { target: { value: "سارة" } })
  fireEvent.change(screen.getByLabelText(/^اللقب/), { target: { value: "بن علي" } })
  fireEvent.change(screen.getByLabelText(/العمر \(بالسنوات\)/), { target: { value: "25" } })
  fireEvent.change(screen.getByLabelText(/رقم الهاتف/), { target: { value: "22345678" } })
}

describe("registration form — «الجنس»", () => {
  it("is required: nothing is collected until a gender is chosen", () => {
    const onCollect = vi.fn()
    render(<Harness onCollect={onCollect} />)
    fillRequired()
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }))
    expect(onCollect).toHaveBeenLastCalledWith(undefined)
    expect(screen.getByText("اختر الجنس")).toBeTruthy()
  })

  it("collects the chosen gender and sends it to the API", () => {
    const onCollect = vi.fn()
    render(<Harness onCollect={onCollect} />)
    fillRequired()
    const choices = screen.getByRole("radiogroup", { name: "الجنس" })
    expect(screen.getAllByRole("radio", { name: /ذكر|أنثى/ })).toHaveLength(2)
    fireEvent.click(screen.getByRole("radio", { name: "أنثى" }))
    expect(choices.querySelector('[aria-checked="true"]')?.textContent).toContain("أنثى")
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }))
    const fields = onCollect.mock.lastCall?.[0] as Parameters<typeof toRequestBody>[0]
    expect(fields).toMatchObject({ firstName: "سارة", gender: "FEMALE" })
    expect(toRequestBody(fields)).toMatchObject({ gender: "FEMALE" })
  })

  describe("previous experience", () => {
    function fillValid() {
      fillRequired()
      fireEvent.click(screen.getByRole("radio", { name: "ذكر" }))
    }

    it("is required when «نعم» is chosen", () => {
      const onCollect = vi.fn()
      render(<Harness onCollect={onCollect} />)
      fillValid()
      fireEvent.click(screen.getByRole("radio", { name: "نعم" }))
      fireEvent.click(screen.getByRole("button", { name: "إرسال" }))
      expect(onCollect).toHaveBeenLastCalledWith(undefined)
      expect(screen.getByText("اذكر التجربة السابقة في دراسة القرآن")).toBeTruthy()

      fireEvent.change(screen.getByLabelText(/التجربة السابقة/), { target: { value: "  حفظ جزء عمّ " } })
      fireEvent.click(screen.getByRole("button", { name: "إرسال" }))
      expect(onCollect.mock.lastCall?.[0]).toMatchObject({ hasStudiedQuranBefore: true, previousExperience: "حفظ جزء عمّ" })
    })

    it("is not asked when «لا» is chosen (the default)", () => {
      const onCollect = vi.fn()
      render(<Harness onCollect={onCollect} />)
      fillValid()
      expect(screen.queryByLabelText(/التجربة السابقة/)).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: "إرسال" }))
      expect(onCollect.mock.lastCall?.[0]).toMatchObject({ hasStudiedQuranBefore: false })
      expect(onCollect.mock.lastCall?.[0]).not.toHaveProperty("previousExperience", expect.anything())
    })
  })
})

describe("registration form — a refused submit on a long page", () => {
  /** As the public page and the admin dialog submit it */
  function SubmitHarness({ onCollect }: { onCollect: (fields: unknown) => void }) {
    const form = useRegistrationForm("2026-10-15")
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          const fields = form.collect()
          if (!fields) return focusFirstInvalid(e.currentTarget)
          onCollect(fields)
        }}
      >
        {form.fields("reg", "self")}
        <button type="submit">إرسال</button>
      </form>
    )
  }

  it("focuses the first field to correct (its error stays under it)", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] })
    const onCollect = vi.fn()
    render(<SubmitHarness onCollect={onCollect} />)
    fireEvent.change(screen.getByLabelText(/^الاسم/), { target: { value: "سارة" } })
    fireEvent.change(screen.getByLabelText(/^اللقب/), { target: { value: "بن علي" } })
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }))
    act(() => vi.advanceTimersToNextFrame())
    expect(onCollect).not.toHaveBeenCalled()
    // «الجنس» is the first field left empty
    expect(screen.getByRole("radiogroup", { name: "الجنس" }).contains(document.activeElement)).toBe(true)
    expect(screen.getByText("اختر الجنس")).toBeTruthy()
    vi.useRealTimers()
  })
})
