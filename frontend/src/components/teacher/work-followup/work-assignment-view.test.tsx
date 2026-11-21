import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { EDITION_ID, type WorkloadSnapshot } from "@/lib/quran-reference/work-assignment"

import { ownDescription, WorkAssignmentView } from "./work-assignment-view"

const exact = (value: number) => ({ kind: "exact" as const, value, touched: value, dataStatus: "x" })
const none = { kind: "unavailable" as const, reason: "x" }
const snap = (verses: number, extra: Partial<WorkloadSnapshot> = {}): WorkloadSnapshot => ({
  editionId: EDITION_ID,
  verses,
  surahs: { whole: 1, touched: 1 },
  pages: exact(159),
  juz: none,
  hizbs: none,
  quarters: none,
  eighths: none,
  dataStatus: "x",
  authoritative: false,
  ...extra,
})
const approx = (hizbs: number) => ({ kind: "approximate" as const, hizbs, step: 1, eighths: { greaterThan: 124, lessThan: 125 } })
const range = { kind: "SURAH_RANGE" as const, editionId: EDITION_ID, fromSurah: 37, fromAyah: 1, toSurah: 114, toAyah: 6, fromPage: null, toPage: null }

describe("WorkAssignmentView (cards and details)", () => {
  it("card (compact): summary, one size in hizbs and the exact page hint; no verse count from 100, no verification sentence", () => {
    render(<WorkAssignmentView type="REVISION" assignment={range} workload={snap(2448, { hizbEquivalent: approx(16) })} compact />)
    expect(screen.getByText("من سورة الصافات إلى سورة الناس")).toBeTruthy()
    expect(screen.getByText("16 حزبًا تقريبًا").dataset.precision).toBe("approximate")
    expect(screen.getByText("159 صفحة").dataset.hint).toBe("pages")
    expect(screen.queryByText(/آية/)).toBeNull()
    expect(screen.queryByText(/قيد التحقق|مرجع المصحف/)).toBeNull()
  })

  it("card with < 100 verses: its single verse chip; the page hint never stands alone next to it", () => {
    render(<WorkAssignmentView type="REVISION" assignment={range} workload={snap(67, { hizbEquivalent: { kind: "exact", hizbs: 1 } })} compact />)
    expect(screen.getByText("67 آية")).toBeTruthy()
    expect(screen.queryByText("حزب واحد")).toBeNull()
    expect(document.querySelector("[data-hint]")).toBeNull()
  })

  it("details: verse count, size and hint together; still no verification sentence", () => {
    render(<WorkAssignmentView type="REVISION" assignment={range} workload={snap(67, { hizbEquivalent: { kind: "exact", hizbs: 1 } })} />)
    const list = screen.getByRole("list", { name: "مقدار العمل" })
    expect([...list.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["67 آية", "حزب واحد", "159 صفحة"])
    expect(screen.queryByText(/قيد التحقق|مرجع المصحف/)).toBeNull()
  })

  it("a snapshot without a size in hizbs: pages only, no hint", () => {
    render(<WorkAssignmentView type="EXAM" assignment={range} workload={snap(129)} />)
    expect(screen.getByText("159 صفحة").dataset.precision).toBe("exact")
    expect(document.querySelector("[data-hint]")).toBeNull()
  })
})

describe("حفظ summaries and older items", () => {
  const nasr = { kind: "AYAH_RANGE" as const, editionId: EDITION_ID, fromSurah: 110, fromAyah: 1, toSurah: 110, toAyah: 3, fromPage: null, toPage: null }
  it("a whole surah reads «سورة النصر كاملة»; a single verse / page their short form", () => {
    render(<WorkAssignmentView type="MEMORIZATION" assignment={nasr} workload={null} />)
    expect(screen.getByText("سورة النصر كاملة")).toBeTruthy()
  })
  it("the older default wording of a whole surah is not shown as the teacher's note; a real note is", () => {
    const base = { type: "MEMORIZATION" as const, recitationNumber: null, assignment: nasr }
    expect(ownDescription({ ...base, description: "سورة النصر: من الآية 1 إلى الآية 3" })).toBeNull()
    expect(ownDescription({ ...base, description: "سورة النصر كاملة" })).toBeNull()
    expect(ownDescription({ ...base, description: "مع مراجعة التجويد" })).toBe("مع مراجعة التجويد")
  })
})
