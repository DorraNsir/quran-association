import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { StudentCombobox } from "./student-combobox"

// jsdom lacks what cmdk / Radix call
Element.prototype.scrollIntoView ??= () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const classes = [
  { id: "c1", label: "مجموعة الفجر" },
  { id: "c2", label: "مجموعة الأمل" },
]
const students = [
  { id: "s1", firstName: "محمد", lastName: "التونسي", groupClassId: "c1", photoUrl: "/api/files/p1" },
  { id: "s2", firstName: "آمنة", lastName: "بن علي", groupClassId: "c1", photoUrl: "/api/files/missing" },
  { id: "s3", firstName: "Sara", lastName: "Ben Ali", groupClassId: "c2", photoUrl: null },
]
let photoCalls: string[] = []

beforeEach(() => {
  setSession(authResponse("u1", ["TEACHER"]))
  photoCalls = []
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:http://localhost/p"), revokeObjectURL: vi.fn() }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      photoCalls.push(`${url} ${(init?.headers as Record<string, string>)?.Authorization ?? ""}`)
      return url.endsWith("/p1") ? new Response(new Blob(["png"]), { status: 200 }) : json(404, { code: "NOT_FOUND", message: "x" })
    })
  )
})
afterEach(() => clearSession())

function open(value = "", onChange = vi.fn()) {
  renderWithClient(
    <DirectionProvider dir="rtl">
      <StudentCombobox id="wf-student" value={value} onChange={onChange} students={students} classes={classes} />
    </DirectionProvider>
  )
  fireEvent.click(screen.getByRole("combobox"))
  return onChange
}
const options = () => screen.queryAllByRole("option").map((o) => o.textContent)

describe("«اختر الطالب» (web): photos, search, groups", () => {
  it("each row: the photo fetched with the token (private), or the first letter — also for a missing photo", async () => {
    open()
    await waitFor(() => expect(photoCalls.some((c) => c.endsWith("/api/files/p1 Bearer token-u1"))).toBe(true))
    const sara = screen.getByRole("option", { name: /Sara Ben Ali/ })
    expect(within(sara).getByText("S")).toBeTruthy()
    const amna = screen.getByRole("option", { name: /آمنة بن علي/ })
    await waitFor(() => expect(photoCalls.some((c) => c.includes("/api/files/missing"))).toBe(true))
    expect(within(amna).getByText("آ")).toBeTruthy()
    expect(amna.querySelector("img")).toBeNull()
    // group headings
    expect(screen.getByText("مجموعة الفجر")).toBeTruthy()
    expect(screen.getByText("مجموعة الأمل")).toBeTruthy()
  })

  it("search: Arabic (hamza tolerant), Latin (any case); headings of matching groups only; a clear empty state", async () => {
    open()
    const input = screen.getByLabelText("البحث عن طالب بالاسم")
    fireEvent.change(input, { target: { value: "امنة" } })
    await waitFor(() => expect(options()).toEqual(["آآمنة بن علي"]))
    const shown = (heading: string) => !screen.getByText(heading).closest("[cmdk-group]")!.hasAttribute("hidden")
    expect([shown("مجموعة الفجر"), shown("مجموعة الأمل")]).toEqual([true, false])
    fireEvent.change(input, { target: { value: "sARA" } })
    await waitFor(() => expect(options()).toEqual(["SSara Ben Ali"]))
    fireEvent.change(input, { target: { value: "زكرياء" } })
    await waitFor(() => expect(options()).toEqual([]))
    expect(screen.getByText("لا يوجد طالب بهذا الاسم")).toBeTruthy()
  })

  it("choosing a student closes the list and shows their photo or initial and name in the field", async () => {
    const onChange = open()
    fireEvent.click(screen.getByRole("option", { name: /Sara Ben Ali/ }))
    expect(onChange).toHaveBeenCalledWith("s3")
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
  })

  it("the field shows the chosen student", () => {
    renderWithClient(<StudentCombobox id="x" value="s3" onChange={vi.fn()} students={students} classes={classes} />)
    const field = screen.getByRole("combobox")
    expect(field.textContent).toBe("SSara Ben Ali")
  })
})
