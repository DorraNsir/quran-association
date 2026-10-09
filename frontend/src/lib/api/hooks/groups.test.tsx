import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { authResponse, json, mockFetch } from "@/test/fetch-mock"
import { testQueryClient, wrapperFor } from "@/test/render"
import type { WeeklySchedule } from "@/types/domain"

import { clearSession, setSession } from "../session"
import { useSaveClass, type ClassSaveInput } from "./groups"

const team = { supervisorId: "t1", assistantIds: [], status: "ACTIVE" as const, groupId: "g1" }
const previousSlots: WeeklySchedule[] = [
  { id: "s1", groupClassId: "c1", day: "MON", start: "09:00", end: "11:00", roomId: "r1" },
  { id: "s2", groupClassId: "c1", day: "WED", start: "09:00", end: "11:00", roomId: "r2" },
  { id: "s3", groupClassId: "c1", day: "FRI", start: "09:00", end: "11:00", roomId: "r1" },
]

async function save(input: ClassSaveInput, responses: number) {
  const { calls } = mockFetch(...Array.from({ length: responses }, () => json(200, { id: input.groupClass.id ?? "c-new", status: "ACTIVE" })))
  const { result } = renderHook(() => useSaveClass(), { wrapper: wrapperFor(testQueryClient()) })
  await act(() => result.current.mutateAsync(input))
  return calls.map((c) => ({
    method: c.init?.method ?? "GET",
    path: c.url.replace("http://api.test/api", ""),
    body: c.init?.body ? JSON.parse(String(c.init.body)) : undefined,
  }))
}

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("saving a class with one room per weekly slot", () => {
  it("creates the class without a room, then each slot with its own room", async () => {
    const calls = await save(
      {
        groupClass: { ...team, branchId: "b1" },
        studentIds: [],
        currentMemberIds: [],
        previousSlots: [],
        slots: [
          { day: "MON", start: "09:00", end: "11:00", roomId: "r1" },
          { day: "WED", start: "09:00", end: "11:00", roomId: "r2" },
        ],
      },
      3
    )
    expect(calls[0]).toMatchObject({ method: "POST", path: "/admin/group-classes" })
    expect(calls[0].body).not.toHaveProperty("roomId")
    expect(calls.slice(1)).toEqual([
      { method: "POST", path: "/admin/group-classes/c-new/schedules", body: { dayOfWeek: "MON", startTime: "09:00", endTime: "11:00", roomId: "r1" } },
      { method: "POST", path: "/admin/group-classes/c-new/schedules", body: { dayOfWeek: "WED", startTime: "09:00", endTime: "11:00", roomId: "r2" } },
    ])
  })

  it("changes the room of ONE slot only", async () => {
    const calls = await save(
      {
        groupClass: { ...team, id: "c1", branchId: "b1" },
        studentIds: [],
        currentMemberIds: [],
        previousSlots,
        previousBranchId: "b1",
        slots: [{ ...previousSlots[0], roomId: "r2" }, previousSlots[1], previousSlots[2]],
      },
      2
    )
    expect(calls[0].body).not.toHaveProperty("scheduleRooms")
    expect(calls[1]).toEqual({ method: "PATCH", path: "/admin/group-classes/c1/schedules/s1", body: { roomId: "r2" } })
  })

  it("on a branch change sends every kept slot's new room with the class (after deleting removed slots)", async () => {
    const calls = await save(
      {
        groupClass: { ...team, id: "c1", branchId: "b2" },
        studentIds: [],
        currentMemberIds: [],
        previousSlots,
        previousBranchId: "b1",
        slots: [
          { ...previousSlots[0], roomId: "r3" },
          { ...previousSlots[1], start: "10:00", end: "12:00", roomId: "r4" },
        ],
      },
      3
    )
    expect(calls[0]).toEqual({ method: "DELETE", path: "/admin/group-classes/c1/schedules/s3", body: undefined })
    expect(calls[1]).toMatchObject({
      method: "PATCH",
      path: "/admin/group-classes/c1",
      body: {
        branchId: "b2",
        scheduleRooms: [
          { scheduleId: "s1", roomId: "r3" },
          { scheduleId: "s2", roomId: "r4" },
        ],
      },
    })
    // The time change follows; the room was already applied with the branch
    expect(calls[2]).toEqual({
      method: "PATCH",
      path: "/admin/group-classes/c1/schedules/s2",
      body: { dayOfWeek: "WED", startTime: "10:00", endTime: "12:00" },
    })
  })
})
