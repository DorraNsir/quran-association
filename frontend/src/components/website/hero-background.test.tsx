import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/site-font", () => ({ amiri: { variable: "font-amiri", style: { fontFamily: "Amiri" } } }))

import { HomeHero } from "./blocks"
import HeroBackground, { DEFAULT_HERO_THEME, HERO_THEMES, isHeroVariant } from "./hero-background"

/* jsdom has no canvas, observers or matchMedia: minimal stand-ins */
let reducedMotion = false
const observers: { disconnect: ReturnType<typeof vi.fn> }[] = []
beforeEach(() => {
  reducedMotion = false
  observers.length = 0
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: query.includes("reduce") && reducedMotion, addEventListener() {}, removeEventListener() {} }))
  )
  class FakeObserver {
    disconnect = vi.fn()
    constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {
      observers.push(this)
    }
    observe() {
      this.cb([{ isIntersecting: true }])
    }
    unobserve() {}
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver)
  vi.stubGlobal("ResizeObserver", FakeObserver)
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1))
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
  // A 2D context whose every method is a no-op (gradients included)
  const ctx: object = new Proxy({}, { get: (_, key) => (key === "createRadialGradient" || key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {}), set: () => true })
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as CanvasRenderingContext2D)
})
afterEach(() => vi.unstubAllGlobals())

describe("HeroBackground", () => {
  it("offers exactly the six themes, combo by default", () => {
    expect(HERO_THEMES.map((t) => t.value)).toEqual(["geometric", "aurora", "lights", "stars", "letters", "combo"])
    expect(DEFAULT_HERO_THEME).toBe("combo")
    expect(isHeroVariant("stars")).toBe(true)
    expect(isHeroVariant("carousel")).toBe(false)
  })

  it.each(HERO_THEMES.map((t) => t.value))("renders %s as a decorative layer that never takes clicks", (variant) => {
    const { container } = render(<HeroBackground variant={variant} />)
    const root = container.querySelector(`[data-hero-theme="${variant}"]`) as HTMLElement
    expect(root).toBeTruthy()
    expect(root.getAttribute("aria-hidden")).toBe("true")
    expect(root.style.pointerEvents).toBe("none")
    const canvas = root.querySelector("canvas")
    expect(Boolean(canvas)).toBe(["lights", "stars", "letters"].includes(variant))
    expect(Boolean(root.querySelector(".hb-geo"))).toBe(variant === "geometric" || variant === "combo")
    expect(Boolean(root.querySelector(".hb-aurora"))).toBe(variant === "aurora" || variant === "combo")
  })

  it("animates canvas themes only while visible, and stops everything on unmount", () => {
    const { unmount } = render(<HeroBackground variant="stars" />)
    expect(requestAnimationFrame).toHaveBeenCalled()
    unmount()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(observers.every((o) => o.disconnect.mock.calls.length > 0)).toBe(true)
  })

  it("respects prefers-reduced-motion: one still frame, no animation loop", () => {
    reducedMotion = true
    render(<HeroBackground variant="letters" />)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
})

describe("HomeHero", () => {
  it("shows the saved theme behind the unchanged content, with no slideshow", () => {
    const { container } = render(<HomeHero theme="aurora" title="بيئة تربوية لحفظ كتاب الله وتعلّمه" subtitle="وصف قصير" />)
    expect(container.querySelector('[data-hero-theme="aurora"]')).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("بيئة تربوية لحفظ كتاب الله وتعلّمه")
    expect(screen.getByText("وصف قصير")).toBeTruthy()
    expect(screen.getByRole("link", { name: "سجل الآن" }).getAttribute("href")).toBe("/registration")
    expect(screen.getByRole("link", { name: "اكتشف برامجنا" }).getAttribute("href")).toBe("/programs")
    expect(container.querySelector('[aria-roledescription="carousel"]')).toBeNull()
    expect(screen.queryByRole("button", { name: /الشريحة/ })).toBeNull()
  })
})
