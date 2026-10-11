import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  getHome: vi.fn(),
  getGallery: vi.fn(),
  getEvents: vi.fn(),
  getNews: vi.fn(),
  getAchievements: vi.fn(),
  getGraduates: vi.fn(),
  getPrograms: vi.fn(),
  getServices: vi.fn(),
  getSiteSettings: vi.fn(),
}))
vi.mock("@/lib/api/public-site", () => api)
vi.mock("@/lib/site-font", () => ({ amiri: { variable: "font-amiri", style: { fontFamily: "Amiri" } } }))
// The animation has its own tests; here it only needs to be present
vi.mock("./hero-background", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hero-background")>()),
  default: ({ variant }: { variant: string }) => <div data-hero-theme={variant} aria-hidden />,
}))
vi.mock("@/lib/dates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/dates")>()), todayInTunis: () => "2026-10-11" }))

import { AchievementsPage, EventsPage, GalleryPage, GraduatesPage, HomePage, NewsPage, ProgramsPage } from "./pages"

const STAMP = { createdAt: "2026-10-01", updatedAt: "2026-10-01" }
const settings = {
  name: "الفرع المحلي عمر بن الخطاب", logoUrl: null, address: null, phone: null, email: null,
  shortDescription: "بيئة تربوية لحفظ كتاب الله", about: "جمعية قرآنية بدار شعبان الفهري.", history: null,
  mission: "", vision: "", values: null, openingHours: null, mapUrl: null,
  social: { facebook: null, instagram: null, youtube: null }, registrationEnabled: true, heroTheme: "stars",
}
const emptyHome = {
  settings, offerings: [], programs: [], groups: [], events: [], featured: [], graduates: [], news: [], gallery: [],
  statistics: { students: 120, teachers: 12, branches: 2, graduates: 30 },
}
const event = { ...STAMP, id: "e1", titleAr: "مسابقة القرآن الكريم", descriptionAr: "مسابقة سنوية", startDate: "2026-11-20", isPublished: true, isCancelled: false }
const article = { ...STAMP, id: "n1", titleAr: "اختتام الدورة الصيفية", excerptAr: "ملخص الخبر", contentAr: "نص", publishedAt: "2026-10-01", isPublished: true }

const OPTIONAL_TITLES = ["برامج لكل الأعمار", "مجموعات ستفتح قريباً", "الفعاليات القادمة", "إنجازات الجمعية", "من خاتمي الجمعية", "آخر الأخبار", "من حياة الجمعية"]

async function renderPage(page: () => Promise<React.ReactElement>) {
  return render(await page())
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.getGallery.mockResolvedValue([])
  api.getSiteSettings.mockResolvedValue(settings)
  api.getServices.mockResolvedValue([])
})

describe("homepage: optional sections appear only with published content", () => {
  it("with no content, every optional section disappears entirely — the essentials stay", async () => {
    api.getHome.mockResolvedValue(emptyHome)
    const { container } = await renderPage(HomePage)
    for (const title of OPTIONAL_TITLES) expect(screen.queryByRole("heading", { name: title })).toBeNull()
    // No empty-state box or "view all" link left behind
    expect(screen.queryByText(/لا توجد|لا يوجد/)).toBeNull()
    for (const href of ["/events", "/news", "/groups", "/graduates", "/gallery"])
      expect(container.querySelector(`main a[href="${href}"], section a[href="${href}"]`)).toBeNull()
    for (const id of ["events", "news", "groups", "programs", "achievements", "graduates", "gallery"])
      expect(container.querySelector(`#${id}`)).toBeNull()
    // Hero (with the saved animated theme), introduction, statistics and the join band stay
    expect(container.querySelector('[data-hero-theme="stars"]')).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("بيئة تربوية لحفظ كتاب الله وتعلّمه")
    expect(screen.getByRole("heading", { name: settings.name })).toBeTruthy()
    expect(screen.getAllByRole("link", { name: "سجل الآن" }).length).toBeGreaterThan(0)
  })

  it("with published upcoming events and news, exactly those sections appear", async () => {
    api.getHome.mockResolvedValue({ ...emptyHome, events: [event], news: [article] })
    const { container } = await renderPage(HomePage)
    expect(screen.getByRole("heading", { name: "الفعاليات القادمة" })).toBeTruthy()
    expect(screen.getByText("مسابقة القرآن الكريم")).toBeTruthy()
    expect(container.querySelector('#events a[href="/events"]')).toBeTruthy()
    expect(screen.getByRole("heading", { name: "آخر الأخبار" })).toBeTruthy()
    expect(screen.getByText("اختتام الدورة الصيفية")).toBeTruthy()
    for (const title of ["مجموعات ستفتح قريباً", "من خاتمي الجمعية", "من حياة الجمعية", "برامج لكل الأعمار"])
      expect(screen.queryByRole("heading", { name: title })).toBeNull()
  })

  it("an API failure is not shown as an empty homepage (the site error page handles it)", async () => {
    api.getHome.mockRejectedValue(new Error("NETWORK_ERROR"))
    await expect(HomePage()).rejects.toThrow("NETWORK_ERROR")
  })
})

describe("dedicated pages keep their page and empty state", () => {
  it.each([
    ["/events", EventsPage, () => api.getEvents.mockResolvedValue([]), "لا توجد فعاليات حالياً"],
    ["/news", NewsPage, () => api.getNews.mockResolvedValue([]), "لا توجد أخبار حالياً"],
    ["/achievements", AchievementsPage, () => api.getAchievements.mockResolvedValue([]), "لا توجد إنجازات حالياً"],
    ["/graduates", GraduatesPage, () => api.getGraduates.mockResolvedValue([]), "لا يوجد خاتمون لعرضهم حالياً"],
    ["/gallery", GalleryPage, () => api.getGallery.mockResolvedValue([]), "لا توجد صور حالياً"],
    ["/programs", ProgramsPage, () => api.getPrograms.mockResolvedValue([]), "لا توجد برامج متاحة حالياً"],
  ] as const)("%s shows its heading and «%s» message", async (_path, page, arrange, message) => {
    arrange()
    await renderPage(page as () => Promise<React.ReactElement>)
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0)
    expect(screen.getByText(message)).toBeTruthy()
  })

  it("/events with only past events says there is nothing UPCOMING and lists the past ones", async () => {
    api.getEvents.mockImplementation(async (period: string) => (period === "PAST" ? [{ ...event, id: "e0", startDate: "2026-05-01" }] : []))
    await renderPage(EventsPage)
    expect(screen.getByText("لا توجد فعاليات قادمة حالياً")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "فعاليات سابقة" })).toBeTruthy()
  })
})
