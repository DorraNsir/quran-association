import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CalendarEvent, type CalendarEntry } from "@/components/calendar/calendar-event"
import { TooltipProvider } from "@/components/ui/tooltip"
import { formatTimeRange } from "@/lib/format"
import { sessionLabel } from "@/lib/work-followup"

import { ScheduleSummary, WeeklyScheduleGrid } from "./schedule"
import { TimeRange } from "./time-range"

const NBSP = "\u00a0"
/** Visible characters (non-breaking spaces as spaces), in logical order. */
const visible = (text: string | null) => (text ?? "").replace(/\u00a0/g, " ")
/** Any explicit LTR container would draw the start on the LEFT (read last in Arabic). */
const insideLtr = (el: Element) => el.closest("[dir]")?.getAttribute("dir") === "ltr"
const ISOLATES = /[\u2066-\u2069\u200e\u200f]/

/**
 * Time ranges follow the Arabic (RTL) reading order: start on the right (read
 * first), end on the left. jsdom does not lay text out: these tests check the
 * markup that produces it (no LTR container, no direction marks); the drawn
 * order itself is checked in a real browser.
 */
describe("time ranges in the Arabic (RTL) interface", () => {
  it("formatTimeRange: start then end in logical order, no direction marks, never wrapped in the middle", () => {
    for (const [start, end] of [["09:00", "11:00"], ["12:00", "15:00"]]) {
      const text = formatTimeRange(start, end)
      expect(text).toBe(`${start}${NBSP}–${NBSP}${end}`)
      expect(ISOLATES.test(text)).toBe(false)
    }
  })

  it("inside an Arabic sentence the surrounding text is untouched", () => {
    const sentence = `حصة الأحد (${formatTimeRange("12:00", "15:00")}) فقط`
    expect(sentence).toBe(`حصة الأحد (12:00${NBSP}–${NBSP}15:00) فقط`)
    expect(ISOLATES.test(sessionLabel({ date: "2026-10-18", startTime: "12:00", endTime: "15:00" }))).toBe(false)
  })

  it("<TimeRange>: one non-wrapping unit in the page's RTL direction", () => {
    render(
      <div dir="rtl">
        حصة <TimeRange start="12:00" end="15:00" /> في القاعة 2
      </div>
    )
    const range = screen.getByText((_, el) => el?.tagName === "SPAN" && visible(el.textContent) === "12:00 – 15:00")
    expect(range.hasAttribute("dir")).toBe(false)
    expect(insideLtr(range)).toBe(false)
    expect(range.className).toMatch(/inline-block/)
    expect(range.className).toMatch(/whitespace-nowrap/)
  })

  it("weekly schedules (normal and shared slots): every range in RTL order, none inside an LTR container", () => {
    const slots = [
      { day: "MON" as const, start: "09:00", end: "11:00" },
      { day: "WED" as const, start: "12:00", end: "15:00" },
    ]
    const { container } = render(
      <div dir="rtl">
        <ScheduleSummary schedule={slots} />
        <WeeklyScheduleGrid
          entries={[
            { slot: slots[0], title: "حصة مشتركة — الارقم + الماهر" },
            { slot: slots[1], title: "الماهر" },
          ]}
        />
      </div>
    )
    const ranges = [...container.querySelectorAll("span")].filter((s) => /\d\d:\d\d.–.\d\d:\d\d/.test(visible(s.textContent)) && s.children.length === 0)
    // Summary (2) + grid desktop and mobile copies (2 × 2)
    expect(ranges).toHaveLength(6)
    for (const r of ranges) {
      expect(insideLtr(r)).toBe(false)
      expect(visible(r.textContent)).toMatch(/^(09:00 – 11:00|12:00 – 15:00)$/)
    }
  })

  it("calendar blocks: start (and end when wide enough) in RTL order", () => {
    const entry = {
      schedule: { id: "s", groupClassId: "c", day: "MON", start: "12:00", end: "15:00", roomId: "r" },
      group: { id: "g", name: "الماهر", audience: "", status: "ACTIVE", createdAt: "" },
      groupClass: { id: "c", groupId: "g", branchId: "b", supervisorId: "t", assistantIds: [], status: "ACTIVE" },
      rooms: [],
      assistants: [],
      studentCount: 0,
      tone: 0,
    } as CalendarEntry
    const { container } = render(
      <TooltipProvider>
        <div dir="rtl">
          <CalendarEvent entry={entry} onOpen={() => {}} />
        </div>
      </TooltipProvider>
    )
    const unit = [...container.querySelectorAll("span.whitespace-nowrap")].find((s) => visible(s.textContent).startsWith("12:00"))!
    expect(visible(unit.textContent)).toBe("12:00 – 15:00")
    expect(insideLtr(unit)).toBe(false)
  })
})
