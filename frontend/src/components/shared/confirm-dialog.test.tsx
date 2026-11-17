import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ConfirmDialog } from "./confirm-dialog"

/** Regression: a double click on «تأكيد» must not run the action twice. */
function renderDialog(onConfirm: () => void | Promise<unknown>, onOpenChange = vi.fn()) {
  render(<ConfirmDialog open onOpenChange={onOpenChange} title="حذف؟" description="لا يمكن التراجع" confirmLabel="تأكيد" onConfirm={onConfirm} />)
  return { confirm: () => screen.getByRole("button", { name: "تأكيد" }), onOpenChange }
}

describe("ConfirmDialog — duplicate confirmation", () => {
  it("an API action (promise): rapid second and third clicks are ignored", async () => {
    let finish!: () => void
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const { confirm } = renderDialog(onConfirm)
    fireEvent.click(confirm())
    fireEvent.click(confirm())
    fireEvent.click(confirm())
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await act(async () => finish())
  })

  it("while it runs, the dialog cannot be dismissed", async () => {
    let finish!: () => void
    const { confirm, onOpenChange } = renderDialog(() => new Promise<void>((resolve) => (finish = resolve)))
    fireEvent.click(confirm())
    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }))
    expect(onOpenChange).not.toHaveBeenCalled()
    await act(async () => finish())
  })

  it("a success releases the lock (the dialog can be used again)", async () => {
    const onConfirm = vi.fn(() => Promise.resolve())
    const { confirm } = renderDialog(onConfirm)
    await act(async () => fireEvent.click(confirm()))
    await act(async () => fireEvent.click(confirm()))
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })

  it("a failure shows the error and releases the lock: retry works", async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(undefined)
    const { confirm } = renderDialog(onConfirm)
    await act(async () => fireEvent.click(confirm()))
    expect(screen.getByRole("alert")).toBeTruthy()
    await act(async () => fireEvent.click(confirm()))
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })

  it("a synchronous onConfirm keeps its behaviour: called, then the dialog closes", () => {
    const onConfirm = vi.fn()
    const { confirm, onOpenChange } = renderDialog(onConfirm)
    fireEvent.click(confirm())
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
