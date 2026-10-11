import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/site-font", () => ({ amiri: { variable: "font-amiri", style: { fontFamily: "Amiri" } } }))
vi.mock("@/components/website/hero-background", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/website/hero-background")>()
  // The animation itself has its own tests: a light stand-in keeps the theme visible
  return { ...actual, default: ({ variant }: { variant: string }) => <div data-hero-theme={variant} aria-hidden /> }
})

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json, mockFetch } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { HeroThemeSettings } from "./hero-theme-settings"

const settings = (heroTheme: string) => ({
  association: null,
  platform: null,
  website: {
    shortDescription: "", about: "", history: null, mission: "", vision: "", values: null, openingHours: null,
    mapUrl: null, facebookUrl: null, instagramUrl: null, youtubeUrl: null, registrationEnabled: true, heroTheme, updatedAt: "2026-10-11",
  },
  currentAcademicYear: null,
})

function renderPage() {
  return renderWithClient(
    <DirectionProvider dir="rtl">
      <HeroThemeSettings />
    </DirectionProvider>
  )
}

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("hero theme selector", () => {
  it("shows six live previews and marks the saved theme as current", async () => {
    mockFetch(json(200, settings("combo")))
    renderPage()
    const radios = await screen.findAllByRole("radio")
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "زخارف هندسية", "الشفق المضيء", "الأضواء المتصاعدة", "السماء المرصعة بالنجوم", "الحروف العربية", "الزخارف والشفق",
    ])
    for (const radio of radios) expect(radio.querySelector("[data-hero-theme]")).toBeTruthy()
    const combo = screen.getByRole("radio", { name: "الزخارف والشفق" })
    expect(combo.getAttribute("aria-checked")).toBe("true")
    expect(within(combo.closest("[data-slot=card]") as HTMLElement).getByText("المظهر الحالي")).toBeTruthy()
    expect((screen.getAllByRole("button", { name: "حفظ المظهر" })[0] as HTMLButtonElement).disabled).toBe(true)
  })

  it("selecting or previewing saves nothing; «حفظ المظهر» saves the selection", async () => {
    const { calls } = mockFetch(json(200, settings("combo")), json(200, settings("stars")))
    renderPage()
    fireEvent.click(await screen.findByRole("radio", { name: "السماء المرصعة بالنجوم" }))
    expect(screen.getByRole("radio", { name: "السماء المرصعة بالنجوم" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("status").textContent).toContain("لن يتغيّر الموقع")

    // Full-size preview of another theme: still nothing sent
    fireEvent.click(screen.getAllByRole("button", { name: "معاينة" })[4])
    expect(await screen.findByRole("dialog")).toBeTruthy()
    expect(screen.getByRole("dialog").querySelector('[data-hero-theme="letters"]')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(calls).toHaveLength(1)

    fireEvent.click(screen.getAllByRole("button", { name: "حفظ المظهر" })[0])
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].url).toBe("http://api.test/api/admin/settings")
    expect(calls[1].init?.method).toBe("PATCH")
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ website: { heroTheme: "stars" } })
    // The backend's answer becomes the current theme
    await waitFor(() =>
      expect(within(screen.getByRole("radio", { name: "السماء المرصعة بالنجوم" }).closest("[data-slot=card]") as HTMLElement).getByText("المظهر الحالي")).toBeTruthy()
    )
  })

  it("shows the API error and keeps the selection when saving fails", async () => {
    mockFetch(json(200, settings("combo")), json(400, { code: "VALIDATION_ERROR", message: "قيمة غير صالحة" }))
    renderPage()
    fireEvent.click(await screen.findByRole("radio", { name: "الأضواء المتصاعدة" }))
    fireEvent.click(screen.getAllByRole("button", { name: "حفظ المظهر" })[0])
    await waitFor(() => expect((screen.getAllByRole("button", { name: "حفظ المظهر" })[0] as HTMLButtonElement).disabled).toBe(false))
    expect(screen.getByRole("radio", { name: "الأضواء المتصاعدة" }).getAttribute("aria-checked")).toBe("true")
    expect(within(screen.getByRole("radio", { name: "الزخارف والشفق" }).closest("[data-slot=card]") as HTMLElement).getByText("المظهر الحالي")).toBeTruthy()
  })
})
