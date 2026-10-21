import { render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ScrollToHash } from "./scroll-to-hash"

const page = () => (
  <div>
    <section id="group-classes">
      <ScrollToHash id="group-classes" />
      أقسام المجموعة
    </section>
  </div>
)

afterEach(() => {
  window.history.replaceState(null, "", "/")
  vi.restoreAllMocks()
})

describe("ScrollToHash", () => {
  it("scrolls to its section when the URL hash names it", () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    window.history.replaceState(null, "", "/admin/groups/g1#group-classes")
    render(page())
    expect(scroll).toHaveBeenCalledWith({ block: "start" })
  })

  it("does nothing for another hash or none", () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    window.history.replaceState(null, "", "/admin/groups/g1#other")
    render(page())
    window.history.replaceState(null, "", "/admin/groups/g1")
    render(page())
    expect(scroll).not.toHaveBeenCalled()
  })
})
