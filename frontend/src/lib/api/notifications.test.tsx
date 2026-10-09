import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { json, mockFetch } from "@/test/fetch-mock"
import { testQueryClient, wrapperFor } from "@/test/render"

import { useUnreadCount } from "./notifications"

afterEach(() => vi.useRealTimers())

describe("notifications polling", () => {
  it("polls the unread count every 30 seconds (REST, no WebSocket)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { calls } = mockFetch(json(200, { count: 1 }), json(200, { count: 3 }))
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapperFor(testQueryClient()) })
    await waitFor(() => expect(result.current.data).toBe(1))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_500)
    await waitFor(() => expect(result.current.data).toBe(3))
    expect(calls.every((c) => c.url === "http://api.test/api/notifications/unread-count")).toBe(true)
  })
})
