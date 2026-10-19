import { describe, expect, it } from "vitest"

import { participatesIn, participatingSchedulesOf, schedulesOf, sharedSlotLabel, teacherWeeklySlots, type Lookups } from "./domain"
import type { WeeklySchedule } from "@/types/domain"

/**
 * «الحصص المشتركة» in the workspaces: درة (D) supervises A (أركان) and
 * B (الماهر); فدوى (F) assists both; B1 only B. A + B share Monday 09:00.
 */
const shared: WeeklySchedule = {
  id: "s-shared",
  groupClassId: "A",
  additionalGroupClassIds: ["B"],
  participants: [
    { groupClassId: "A", group: { id: "g1", name: "أركان" } },
    { groupClassId: "B", group: { id: "g2", name: "الماهر" } },
  ],
  day: "MON",
  start: "09:00",
  end: "11:00",
  roomId: "R1",
}
const aWed: WeeklySchedule = { id: "s-a", groupClassId: "A", day: "WED", start: "09:00", end: "10:00", roomId: "R1" }
const bThu: WeeklySchedule = { id: "s-b", groupClassId: "B", day: "THU", start: "09:00", end: "10:00", roomId: "R1" }

const lookups: Lookups = {
  branches: [{ id: "br", name: "الفرع", address: "نابل", status: "ACTIVE" }],
  rooms: [{ id: "R1", branchId: "br", name: "القاعة 1", status: "ACTIVE" }],
  groups: [
    { id: "g1", name: "أركان", audience: "", status: "ACTIVE", createdAt: "2026-01-01" },
    { id: "g2", name: "الماهر", audience: "", status: "ACTIVE", createdAt: "2026-01-01" },
  ],
  groupClasses: [
    { id: "A", groupId: "g1", branchId: "br", supervisorId: "D", assistantIds: ["F"], status: "ACTIVE" },
    { id: "B", groupId: "g2", branchId: "br", supervisorId: "D", assistantIds: ["F", "B1"], status: "ACTIVE" },
  ],
  teachers: [],
  schedules: [shared, aWed, bThu],
}

describe("shared weekly slots in the workspaces", () => {
  it("a class meets in its own slots and the shared ones it attends", () => {
    expect(participatesIn(shared, "A")).toBe(true)
    expect(participatesIn(shared, "B")).toBe(true)
    expect(participatingSchedulesOf("B", lookups.schedules).map((s) => s.id)).toEqual(["s-shared", "s-b"])
    // Editing paths keep the HOST's own slots only
    expect(schedulesOf("B", lookups.schedules).map((s) => s.id)).toEqual(["s-b"])
  })

  it("a teacher of both classes sees the shared lesson ONCE", () => {
    for (const teacher of ["D", "F"]) {
      const ids = teacherWeeklySlots(teacher, lookups).map((e) => e.slot.id)
      expect(ids.filter((id) => id === "s-shared")).toHaveLength(1)
      expect(new Set(ids)).toEqual(new Set(["s-shared", "s-a", "s-b"]))
    }
  })

  it("an assistant of one class sees it through that class", () => {
    expect(teacherWeeklySlots("B1", lookups).map((e) => e.slot.id).sort()).toEqual(["s-b", "s-shared"])
  })

  it("labels: all programs for a shared slot, nothing for a normal one (or without participant data)", () => {
    expect(sharedSlotLabel(shared)).toBe("أركان + الماهر")
    expect(sharedSlotLabel(aWed)).toBeNull()
    // Admin data without participants: unchanged single-class behavior
    expect(participatesIn({ ...shared, additionalGroupClassIds: undefined, participants: undefined }, "B")).toBe(false)
  })
})

describe("shared lessons — frontend conflict check and adapters", () => {
  const ctx = { schedules: lookups.schedules, groupClasses: lookups.groupClasses, groups: lookups.groups }
  const A = lookups.groupClasses[0]
  const B = lookups.groupClasses[1]

  it("a shared slot occupies all its classes and their teams; its own classes never conflict with each other", async () => {
    const { findConflicts } = await import("./scheduling")
    // B alone on Monday 10:00 → B is already in the shared lesson (CLASS)
    const clash = findConflicts({ day: "MON", start: "10:00", end: "10:30", roomId: "R9", groupClass: B }, ctx)
    expect(clash.map((c) => c.type)).toContain("CLASS")
    // Editing the shared slot itself: no conflict with itself
    expect(findConflicts({ ...shared, id: "s-shared", groupClass: A, additionalClasses: [B] }, ctx)).toEqual([])
    // Another lesson with B's assistant (B1 is in the shared team) → TEACHER
    const other = { id: "X", supervisorId: "Z", assistantIds: ["B1"] }
    expect(
      findConflicts({ day: "MON", start: "09:30", end: "10:00", roomId: "R9", groupClass: other }, ctx).map((c) => c.type)
    ).toEqual(["TEACHER"])
  })

  it("API adapters: a shared slot keeps its participants; a shared session row is titled with every program", async () => {
    const { toSchedule } = await import("./api/academic")
    const slot = toSchedule({
      id: "s1",
      dayOfWeek: "MON",
      startTime: "09:00",
      endTime: "11:00",
      groupClass: { id: "A", group: { id: "g1", name: "أركان" } },
      additionalClasses: [{ id: "B", group: { id: "g2", name: "الماهر" } }],
      room: { id: "R1", name: "القاعة 1" },
    })
    expect(slot).toMatchObject({ additionalGroupClassIds: ["B"] })
    expect(sharedSlotLabel(slot)).toBe("أركان + الماهر")
    // A normal slot is unchanged (no participant fields)
    expect(toSchedule({ id: "s2", dayOfWeek: "MON", startTime: "09:00", endTime: "10:00", groupClass: { id: "A" }, room: { id: "R1", name: "x" } })).toEqual({
      id: "s2",
      groupClassId: "A",
      day: "MON",
      start: "09:00",
      end: "10:00",
      roomId: "R1",
    })
    const { entryTitle } = await import("@/components/calendar/calendar-event")
    expect(
      entryTitle({ group: { id: "g1", name: "x", audience: "", status: "ACTIVE", createdAt: "" }, sharedGroups: [
        { id: "g1", name: "مجموعة أركان", audience: "", status: "ACTIVE", createdAt: "" },
        { id: "g2", name: "مجموعة الماهر", audience: "", status: "ACTIVE", createdAt: "" },
      ] })
    ).toBe("أركان + الماهر")
  })
})
