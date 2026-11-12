import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api/errors"
import { authResponse, json, mockFetch } from "@/test/fetch-mock"
import { testQueryClient, wrapperFor } from "@/test/render"

import { clearSession, setSession } from "../session"
import { useSaveClass, useSaveGroup, type ClassSaveInput } from "./groups"

const team = { supervisorId: "t1", assistantIds: ["t2"], status: "ACTIVE" as const, groupId: "g1" }

function calls(list: { url: string; init?: RequestInit }[]) {
  return list.map((c) => ({
    method: c.init?.method ?? "GET",
    path: c.url.replace("http://api.test/api", ""),
    body: c.init?.body ? JSON.parse(String(c.init.body)) : undefined,
  }))
}

async function save(input: ClassSaveInput, response = json(200, { id: input.groupClass.id ?? "c-new", version: 2 })) {
  const { calls: sent } = mockFetch(response)
  const { result } = renderHook(() => useSaveClass(), { wrapper: wrapperFor(testQueryClient()) })
  const outcome = await act(() => result.current.mutateAsync(input).catch((e: unknown) => e))
  return { sent: calls(sent), outcome }
}

beforeEach(() => {
  clearSession()
  setSession(authResponse("admin"))
})

describe("saving a class: one request, all or nothing", () => {
  it("an edit sends the whole class with the version it was opened with (PUT …/save)", async () => {
    const { sent } = await save({
      groupClass: { ...team, id: "c1", branchId: "b2", version: 7 },
      slots: [
        { id: "s1", day: "MON", start: "09:00", end: "11:00", roomId: "r3" },
        { day: "WED", start: "10:00", end: "12:00", roomId: "r4" },
      ],
    })
    expect(sent).toEqual([
      {
        method: "PUT",
        path: "/admin/group-classes/c1/save",
        body: {
          version: 7,
          branchId: "b2",
          status: "ACTIVE",
          supervisorId: "t1",
          assistantTeacherIds: ["t2"],
          slots: [
            { id: "s1", dayOfWeek: "MON", startTime: "09:00", endTime: "11:00", roomId: "r3" },
            { dayOfWeek: "WED", startTime: "10:00", endTime: "12:00", roomId: "r4" },
          ],
        },
      },
    ])
  })

  it("a new class is created with its slots in the same request", async () => {
    const { sent } = await save({
      groupClass: { ...team, branchId: "b1" },
      slots: [{ day: "MON", start: "09:00", end: "11:00", roomId: "r1" }],
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      method: "POST",
      path: "/admin/group-classes",
      body: { groupId: "g1", branchId: "b1", slots: [{ dayOfWeek: "MON", startTime: "09:00", endTime: "11:00", roomId: "r1" }] },
    })
    expect(sent[0].body).not.toHaveProperty("version")
  })

  it("a stale form is refused as a whole (409), the error reaches the form", async () => {
    const { sent, outcome } = await save(
      { groupClass: { ...team, id: "c1", branchId: "b1", version: 3 }, slots: [] },
      json(409, { statusCode: 409, code: "GROUP_CLASS_CHANGED", message: "عدّل مستخدم آخر هذا القسم منذ فتح النموذج" })
    )
    expect(sent).toHaveLength(1)
    expect(outcome).toBeInstanceOf(ApiError)
    expect((outcome as ApiError).status).toBe(409)
  })
})

describe("saving a group: name and status together", () => {
  it("one PATCH carries the name, audience and status", async () => {
    const { calls: sent } = mockFetch(json(200, { id: "g1", status: "INACTIVE" }))
    const { result } = renderHook(() => useSaveGroup(), { wrapper: wrapperFor(testQueryClient()) })
    await act(() => result.current.mutateAsync({ id: "g1", name: "الماهر", audience: " ", status: "INACTIVE" }))
    expect(calls(sent)).toEqual([
      { method: "PATCH", path: "/admin/groups/g1", body: { name: "الماهر", audience: null, status: "INACTIVE" } },
    ])
  })
})
