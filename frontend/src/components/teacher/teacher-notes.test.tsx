import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { TeacherNotes } from "./teacher-notes"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const LONG = `ملاحظة طويلة\nسطر ثانٍ ${"ا".repeat(200)}`
const notes = [
  { id: "n1", content: "أقدم ملاحظة", createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z" },
  { id: "n2", content: LONG, createdAt: "2026-10-02T08:00:00.000Z", updatedAt: "2026-10-05T09:30:00.000Z" },
]

function routeFetch() {
  const calls: { method: string; path: string; body?: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? "GET"
      calls.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.pathname === "/api/teacher/notes" && method === "GET")
        return json(200, { data: notes, meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 } })
      if (url.pathname === "/api/teacher/notes" && method === "POST")
        return json(201, { id: "n3", content: "x", createdAt: "2026-10-06T08:00:00.000Z", updatedAt: "2026-10-06T08:00:00.000Z" })
      if (method === "DELETE") return new Response(null, { status: 204 })
      return json(404, { code: "NOT_FOUND" })
    })
  )
  return calls
}

const renderNotes = () =>
  renderWithClient(
    <DirectionProvider dir="rtl">
      <TeacherNotes />
    </DirectionProvider>
  )

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["TEACHER"]))
})

describe("«ملاحظاتي» — private notebook", () => {
  it("lists my notes, most recently updated first, full text wrapped, with automatic dates — no student anywhere", async () => {
    routeFetch()
    renderNotes()
    const items = await screen.findAllByRole("listitem")
    expect(items[0].textContent).toContain("ملاحظة طويلة")
    expect(items[1].textContent).toContain("أقدم ملاحظة")
    const full = within(items[0]).getByText(/ملاحظة طويلة/)
    expect(full.textContent).toContain("\n")
    expect(full.className).toMatch(/whitespace-pre-wrap.*\[overflow-wrap:anywhere\]/)
    expect(within(items[0]).getByText(/آخر تعديل/)).toBeTruthy()
    expect(screen.getByText("ملاحظاتك الشخصية الخاصة، لا يمكن لأي شخص آخر الاطلاع عليها.")).toBeTruthy()
    expect(screen.queryByText(/الطالب|كل الطلبة/)).toBeNull()
  })

  it("a new note is only its text: an auto-growing textarea, no student, no date", async () => {
    const calls = routeFetch()
    renderNotes()
    await screen.findAllByRole("listitem")
    fireEvent.click(screen.getByRole("button", { name: "إضافة ملاحظة" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).queryByRole("combobox")).toBeNull()
    expect(dialog.querySelector("input[type=date]")).toBeNull()
    const field = within(dialog).getByLabelText(/الملاحظة/)
    expect(field.tagName).toBe("TEXTAREA")
    // Required
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }))
    expect(within(dialog).getByText("اكتب نص الملاحظة")).toBeTruthy()
    fireEvent.change(field, { target: { value: "  تذكير: تحضير درس الأحد  " } })
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }))
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true))
    expect(calls.find((c) => c.method === "POST")).toEqual({ method: "POST", path: "/api/teacher/notes", body: { content: "تذكير: تحضير درس الأحد" } })
  })

  it("deleting asks for confirmation first", async () => {
    const calls = routeFetch()
    renderNotes()
    const items = await screen.findAllByRole("listitem")
    fireEvent.pointerDown(within(items[1]).getByRole("button", { name: "إجراءات الملاحظة" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "حذف" }))
    expect(await screen.findByText("حذف هذه الملاحظة؟")).toBeTruthy()
    expect(calls.some((c) => c.method === "DELETE")).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "حذف" }))
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/teacher/notes/n1")).toBe(true))
  })
})
