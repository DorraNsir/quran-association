import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import type { Lookups } from "@/lib/domain"

import { AnnouncementFormSheet } from "./announcement-form-sheet"

const lookups: Lookups = {
  branches: [{ id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" }],
  rooms: [{ id: "r1", branchId: "b1", name: "قاعة 1", status: "ACTIVE" }],
  groups: [{ id: "g1", name: "مجموعة الأطفال", audience: "أطفال", status: "ACTIVE", createdAt: "2026-09-01" }],
  groupClasses: [{ id: "c1", groupId: "g1", branchId: "b1", roomId: "r1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" }],
  teachers: [],
  schedules: [],
}

function renderForm(onSave = vi.fn()) {
  render(
    <DirectionProvider dir="rtl">
      <AnnouncementFormSheet open onOpenChange={() => {}} lookups={lookups} onSave={onSave} />
    </DirectionProvider>
  )
  fireEvent.change(screen.getByLabelText(/العنوان/), { target: { value: "اجتماع الأولياء" } })
  fireEvent.change(screen.getByLabelText(/المحتوى/), { target: { value: "يوم السبت على الساعة العاشرة" } })
  return onSave
}

afterEach(() => vi.useRealTimers())

describe("announcement publication modes", () => {
  it("publishes now by default (نشر الآن)", () => {
    const onSave = renderForm()
    expect(screen.getByRole("radio", { name: /نشر الآن/ }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "نشر الإعلان" }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ mode: "PUBLISH_NOW", scheduledAt: undefined }))
    expect(onSave.mock.calls[0][0].input).toMatchObject({ title: "اجتماع الأولياء", audience: "EVERYONE" })
  })

  it("schedules at a Tunis date and time in the future (جدولة النشر)", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date("2026-10-09T08:00:00Z")) // 09:00 in Tunis
    const onSave = renderForm()
    fireEvent.click(screen.getByRole("radio", { name: /جدولة النشر/ }))
    fireEvent.change(screen.getByLabelText(/تاريخ النشر/), { target: { value: "2026-10-09" } })
    fireEvent.change(screen.getByLabelText(/الساعة/), { target: { value: "08:30" } })
    fireEvent.click(screen.getByRole("button", { name: "جدولة النشر" }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText("يجب أن يكون موعد النشر في المستقبل")).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/الساعة/), { target: { value: "18:45" } })
    fireEvent.click(screen.getByRole("button", { name: "جدولة النشر" }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ mode: "SCHEDULE", scheduledAt: "2026-10-09T18:45" }))
  })

  it("saves a draft without publishing (حفظ كمسودة)", () => {
    const onSave = renderForm()
    fireEvent.click(screen.getByRole("radio", { name: /حفظ كمسودة/ }))
    fireEvent.click(screen.getByRole("button", { name: "حفظ كمسودة" }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ mode: "DRAFT" }))
  })

  it("requires a target for specific branches", () => {
    const onSave = renderForm()
    fireEvent.click(screen.getByRole("radio", { name: /فروع محددة/ }))
    fireEvent.click(screen.getByRole("button", { name: "نشر الإعلان" }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText("اختر فرعًا واحدًا على الأقل")).toBeTruthy()
  })
})
