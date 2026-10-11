import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json, mockFetch } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { CmsSection } from "./cms-sections"

vi.mock("@/lib/site-font", () => ({ amiri: { variable: "font-amiri", style: { fontFamily: "Amiri" } } }))
vi.mock("@/lib/dates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/dates")>()), todayInTunis: () => "2026-10-11" }))

const published = { id: "g1", fullName: "أحمد بن علي", completionYear: 2025, completionDate: null, shortMessage: null, photoUrl: null, photoFileId: null, isPublished: true, displayOrder: 0 }
// A legacy record: historical date + recorded consent, currently unpublished
const hidden = { id: "g2", fullName: "سارة محمد", completionYear: 2024, completionDate: "2024-06-15", shortMessage: "الحمد لله", photoUrl: null, photoFileId: null, isPublished: false, consentGivenBy: "GUARDIAN", displayOrder: 1 }

function renderPage() {
  return renderWithClient(
    <DirectionProvider dir="rtl">
      <CmsSection slug="graduates" />
    </DirectionProvider>
  )
}
const bodyOf = (call: { init?: RequestInit }) => JSON.parse(String(call.init?.body))
const card = (name: string) => screen.getByText(name).closest("[data-slot=card]") as HTMLElement

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("الخاتمون — simplified management", () => {
  it("lists every graduate with «إلغاء النشر» or «إعادة النشر», and the year", async () => {
    mockFetch(json(200, [published, hidden]))
    renderPage()
    expect(await screen.findByText("أحمد بن علي")).toBeTruthy()
    expect(within(card("أحمد بن علي")).getByRole("button", { name: "إلغاء النشر" })).toBeTruthy()
    expect(within(card("سارة محمد")).getByRole("button", { name: "إعادة النشر" })).toBeTruthy()
    expect(within(card("سارة محمد")).getByText("غير منشور")).toBeTruthy()
    expect(within(card("أحمد بن علي")).getByText("ختم القرآن · 2025")).toBeTruthy()
    expect(screen.queryByText("دون موافقة مسجّلة")).toBeNull()
  })

  it("unpublish / republish send only the publication state", async () => {
    const { calls } = mockFetch(json(200, [published, hidden]), json(200, { ...published, isPublished: false }), json(200, [{ ...published, isPublished: false }, hidden]), json(200, { ...hidden, isPublished: true }), json(200, [published, { ...hidden, isPublished: true }]))
    renderPage()
    fireEvent.click(within(await screen.findByText("أحمد بن علي").then(() => card("أحمد بن علي"))).getByRole("button", { name: "إلغاء النشر" }))
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PATCH")).toBe(true))
    const off = calls.find((c) => c.init?.method === "PATCH")!
    expect(off.url).toBe("http://api.test/api/admin/cms/graduates/g1")
    expect(bodyOf(off)).toEqual({ isPublished: false })
    // The list reloads from the API after the backend confirms
    await waitFor(() => expect(within(card("أحمد بن علي")).getByRole("button", { name: "إعادة النشر" })).toBeTruthy())
    fireEvent.click(within(card("سارة محمد")).getByRole("button", { name: "إعادة النشر" }))
    await waitFor(() => expect(calls.filter((c) => c.init?.method === "PATCH")).toHaveLength(2))
    expect(bodyOf(calls.filter((c) => c.init?.method === "PATCH")[1])).toEqual({ isPublished: true })
  })

  it("the add form has only the four fields and «إضافة خاتم»; it sends no date, consent or publication state", async () => {
    const { calls } = mockFetch(json(200, []), json(201, { ...published, id: "g3" }), json(200, [published]))
    renderPage()
    fireEvent.click((await screen.findAllByRole("button", { name: "إضافة خاتم" }))[0])
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText(/الاسم الكامل/)).toBeTruthy()
    expect((within(dialog).getByLabelText(/سنة الختم/) as HTMLInputElement).value).toBe("2026")
    expect(within(dialog).getByLabelText(/كلمة قصيرة/)).toBeTruthy()
    expect(within(dialog).getByText("الصورة")).toBeTruthy()
    for (const removed of ["تاريخ الختم", "الموافقة على النشر", "منشور"]) expect(within(dialog).queryByText(removed)).toBeNull()
    expect(within(dialog).queryByRole("checkbox")).toBeNull()
    expect(within(dialog).queryByRole("combobox")).toBeNull()

    // Required: name and year
    fireEvent.change(within(dialog).getByLabelText(/سنة الختم/), { target: { value: "" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة خاتم" }))
    expect(await within(dialog).findByText("الاسم الكامل: حقل مطلوب")).toBeTruthy()
    expect(within(dialog).getByText("سنة الختم: حقل مطلوب")).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText(/سنة الختم/), { target: { value: "2099" } })
    expect(within(dialog).getByText(/سنة صحيحة بين 1900 و2026/)).toBeTruthy()
    expect(calls).toHaveLength(1)

    fireEvent.change(within(dialog).getByLabelText(/الاسم الكامل/), { target: { value: "  يوسف التونسي " } })
    fireEvent.change(within(dialog).getByLabelText(/سنة الختم/), { target: { value: "2026" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة خاتم" }))
    await waitFor(() => expect(calls.some((c) => c.init?.method === "POST")).toBe(true))
    const post = calls.find((c) => c.init?.method === "POST")!
    expect(post.url).toBe("http://api.test/api/admin/cms/graduates")
    expect(bodyOf(post)).toEqual({ fullName: "يوسف التونسي", completionYear: 2026, shortMessage: null })
  })

  it("editing keeps the publication state and the historical data (they are never sent)", async () => {
    const { calls } = mockFetch(json(200, [hidden]), json(200, { ...hidden, fullName: "سارة محمد العربي" }), json(200, [hidden]))
    renderPage()
    const trigger = within(await screen.findByText("سارة محمد").then(() => card("سارة محمد"))).getByRole("button", { name: /إجراءات/ })
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "تعديل" }))
    const dialog = await screen.findByRole("dialog")
    expect((within(dialog).getByLabelText(/سنة الختم/) as HTMLInputElement).value).toBe("2024")
    expect(within(dialog).queryByText("تاريخ الختم")).toBeNull()
    fireEvent.change(within(dialog).getByLabelText(/الاسم الكامل/), { target: { value: "سارة محمد العربي" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ التعديلات" }))
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PATCH")).toBe(true))
    const patch = calls.find((c) => c.init?.method === "PATCH")!
    expect(patch.url).toBe("http://api.test/api/admin/cms/graduates/g2")
    expect(bodyOf(patch)).toEqual({ fullName: "سارة محمد العربي", completionYear: 2024, shortMessage: "الحمد لله" })
  })
})
