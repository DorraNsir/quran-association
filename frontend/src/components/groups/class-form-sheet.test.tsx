import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import type { ClassSaveInput } from "@/lib/api/hooks/groups"
import type { Lookups } from "@/lib/domain"
import { checkClassSlots, keepRoomsOfBranch } from "@/lib/scheduling"
import type { Group, GroupClass } from "@/types/domain"

import { ClassFormSheet } from "./class-form-sheet"

const group: Group = { id: "g1", name: "مجموعة الأطفال", audience: "", status: "ACTIVE", createdAt: "2026-09-01" }
const groupClass: GroupClass = { id: "c1", groupId: "g1", branchId: "b1", supervisorId: "t1", assistantIds: [], status: "ACTIVE" }

const lookups: Lookups = {
  branches: [
    { id: "b1", name: "فرع المركز", address: "نابل", status: "ACTIVE" },
    { id: "b2", name: "فرع الشاطئ", address: "نابل", status: "ACTIVE" },
  ],
  rooms: [
    { id: "r1", branchId: "b1", name: "القاعة 1", status: "ACTIVE" },
    { id: "r2", branchId: "b1", name: "القاعة 2", status: "ACTIVE" },
    { id: "r3", branchId: "b2", name: "قاعة الشاطئ", status: "ACTIVE" },
  ],
  groups: [group],
  groupClasses: [groupClass],
  teachers: [{ id: "t1", firstName: "أحمد", lastName: "بن علي", gender: "MALE", phone: "", status: "ACTIVE", joinedAt: "2026-09-01" }],
  // Monday in room 1, Wednesday in room 2: the rooms of ONE class differ per slot
  schedules: [
    { id: "s1", groupClassId: "c1", day: "MON", start: "09:00", end: "11:00", roomId: "r1" },
    { id: "s2", groupClassId: "c1", day: "WED", start: "09:00", end: "11:00", roomId: "r2" },
  ],
}

function renderForm(onSave = vi.fn<(input: ClassSaveInput) => Promise<void>>(async () => {})) {
  render(
    <DirectionProvider dir="rtl">
      <ClassFormSheet open onOpenChange={() => {}} group={group} groupClass={groupClass} lookups={lookups} students={[]} onSave={onSave} />
    </DirectionProvider>
  )
  return onSave
}

const roomTrigger = (row: number) => screen.getByRole("combobox", { name: `يوم الدراسة ${row}: القاعة` })

describe("class form: one room per weekly slot", () => {
  it("loads each slot with its own room and saves them per row", async () => {
    const onSave = renderForm()
    expect(within(roomTrigger(1)).getByText("القاعة 1")).toBeTruthy()
    expect(within(roomTrigger(2)).getByText("القاعة 2")).toBeTruthy()
    // No class-level room field any more
    expect(screen.queryByRole("combobox", { name: /^القاعة$/ })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const input = onSave.mock.calls[0][0]
    expect(input.slots).toEqual([
      expect.objectContaining({ id: "s1", roomId: "r1" }),
      expect.objectContaining({ id: "s2", roomId: "r2" }),
    ])
    expect(input.previousBranchId).toBe("b1")
    expect(input.groupClass).not.toHaveProperty("roomId")
  })

  it("requires a room on every row (a new row starts without one)", async () => {
    const onSave = renderForm()
    fireEvent.click(screen.getByRole("button", { name: "إضافة يوم دراسة" }))
    expect(roomTrigger(3)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))
    expect(await screen.findByText("اختر قاعة هذه الحصة")).toBeTruthy()
    expect(roomTrigger(3).getAttribute("aria-invalid")).toBe("true")
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe("slot rooms and branches", () => {
  const rows = [
    { key: "a", roomId: "r1" },
    { key: "b", roomId: "r3" },
    { key: "c", roomId: "" },
  ]

  it("a branch change clears only the rooms that are not in the new branch", () => {
    expect(keepRoomsOfBranch(rows, "b2", lookups.rooms)).toEqual([
      { key: "a", roomId: "" },
      { key: "b", roomId: "r3" },
      { key: "c", roomId: "" },
    ])
    expect(keepRoomsOfBranch(rows, "b1", lookups.rooms).map((r) => r.roomId)).toEqual(["r1", "", ""])
  })

  it("checks room conflicts per row: same room overlaps, a different room does not", () => {
    const other: GroupClass = { id: "c2", groupId: "g1", branchId: "b1", supervisorId: "t2", assistantIds: [], status: "ACTIVE" }
    const data = { ...lookups, groupClasses: [groupClass, other] }
    const checks = checkClassSlots(
      [
        { key: "same", day: "MON", start: "10:00", end: "12:00", roomId: "r1" },
        { key: "different", day: "WED", start: "10:00", end: "12:00", roomId: "r1" },
      ],
      other,
      data
    )
    // Monday 09–11 holds room 1 (c1's slot s1); Wednesday's c1 slot is in room 2
    expect(checks.get("same")?.conflicts.map((c) => c.type)).toEqual(["ROOM"])
    expect(checks.get("different")?.conflicts).toEqual([])
  })
})
