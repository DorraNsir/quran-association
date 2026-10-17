import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import type { Session } from "@/types/domain"

import type { CalendarEntry } from "./calendar-event"
import { ScheduleDetailsSheet } from "./schedule-details-sheet"

const occurrence = (status: Session["status"]): Session => ({
  id: "se1", groupClassId: "c1", scheduleId: "s1", roomId: "r1", date: "2026-10-19", start: "09:00", end: "11:00", status,
})
const entry = (status?: Session["status"]): CalendarEntry => ({
  groupClass: { id: "c1", groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" },
  group: { id: "g1", name: "مجموعة الماهر", audience: "أطفال", status: "ACTIVE", createdAt: "2026-09-01" },
  branch: { id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" },
  rooms: [],
  room: { id: "r1", branchId: "b1", name: "القاعة 1", status: "ACTIVE" },
  assistants: [],
  schedule: { id: "s1", groupClassId: "c1", day: "MON", start: "09:00", end: "11:00", roomId: "r1" },
  studentCount: 5,
  tone: 0,
  occurrence: status ? occurrence(status) : undefined,
})

function renderSheet(e: CalendarEntry) {
  const handlers = { onEdit: vi.fn(), onRemove: vi.fn(), onCancelSession: vi.fn() }
  render(
    <DirectionProvider dir="rtl">
      <ScheduleDetailsSheet entry={e} date="2026-10-19" open onOpenChange={() => {}} {...handlers} />
    </DirectionProvider>
  )
  return handlers
}

describe("calendar session sheet — delete the weekly slot vs cancel one session", () => {
  it("«حذف الموعد الأسبوعي» removes the weekly slot; «إلغاء الحصة» cancels only this date", () => {
    const h = renderSheet(entry("SCHEDULED"))
    fireEvent.click(screen.getByRole("button", { name: "حذف الموعد الأسبوعي" }))
    expect(h.onRemove).toHaveBeenCalledTimes(1)
    expect(h.onCancelSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "إلغاء الحصة" }))
    expect(h.onCancelSession).toHaveBeenCalledTimes(1)
    expect(h.onRemove).toHaveBeenCalledTimes(1)
  })

  it.each([["CANCELLED"], ["COMPLETED"], [undefined]] as const)(
    "no «إلغاء الحصة» when this date's session is %s",
    (status) => {
      renderSheet(entry(status))
      expect(screen.queryByRole("button", { name: "إلغاء الحصة" })).toBeNull()
      expect(screen.getByRole("button", { name: "حذف الموعد الأسبوعي" })).toBeTruthy()
    }
  )

  it("a kept lesson of a DELETED slot is not «إضافية» and has no weekly-slot actions", () => {
    renderSheet({ ...entry("SCHEDULED"), detached: true, extra: false })
    expect(screen.getByText(/حصة من موعد أسبوعي محذوف/)).toBeTruthy()
    expect(screen.queryByText(/حصة إضافية/)).toBeNull()
    expect(screen.queryByRole("button", { name: "حذف الموعد الأسبوعي" })).toBeNull()
    expect(screen.queryByRole("button", { name: "تعديل الموعد الأسبوعي" })).toBeNull()
    expect(screen.getByRole("button", { name: "إلغاء الحصة" })).toBeTruthy()
  })

  it("an extra session says so (from the stored flag)", () => {
    renderSheet({ ...entry("SCHEDULED"), detached: true, extra: true })
    expect(screen.getByText(/حصة إضافية \(مرة واحدة\)/)).toBeTruthy()
  })
})
