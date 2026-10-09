import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json, mockFetch } from "@/test/fetch-mock"
import { testQueryClient } from "@/test/render"
import { QueryClientProvider } from "@tanstack/react-query"

import { AuthProvider, useAuth } from "./auth-provider"

function setup() {
  const client = testQueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
  const hook = renderHook(() => useAuth(), { wrapper })
  return { client, hook }
}

beforeEach(() => clearSession())

describe("AuthProvider", () => {
  it("clears every cached query when another account signs in (no data crosses accounts)", async () => {
    const { client, hook } = setup()
    act(() => setSession(authResponse("teacher-a", ["TEACHER"])))
    client.setQueryData(["teacher-workspace"], { students: ["private"] })
    act(() => setSession(authResponse("teacher-b", ["TEACHER"])))
    await waitFor(() => expect(hook.result.current.user?.id).toBe("teacher-b"))
    expect(client.getQueryData(["teacher-workspace"])).toBeUndefined()
  })

  it("keeps the cache when the same account refreshes its token", () => {
    const { client } = setup()
    act(() => setSession(authResponse("u1")))
    client.setQueryData(["branches"], [1])
    act(() => setSession({ ...authResponse("u1"), accessToken: "rotated" }))
    expect(client.getQueryData(["branches"])).toEqual([1])
  })

  it("logout revokes the session and empties the cache", async () => {
    const { client, hook } = setup()
    act(() => setSession(authResponse("u1")))
    client.setQueryData(["students"], ["x"])
    mockFetch(json(204, undefined))
    await act(() => hook.result.current.logout())
    expect(hook.result.current.status).toBe("anonymous")
    expect(client.getQueryData(["students"])).toBeUndefined()
  })

  it("restores the session from the refresh cookie (page reload)", async () => {
    const { hook } = setup()
    mockFetch(json(200, authResponse("u9", ["STUDENT"])))
    await act(() => hook.result.current.restore())
    expect(hook.result.current.status).toBe("authenticated")
    expect(hook.result.current.user?.studentId).toBe("s-u9")
  })

  it("no refresh cookie → anonymous", async () => {
    const { hook } = setup()
    mockFetch(json(401, {}))
    await act(() => hook.result.current.restore())
    expect(hook.result.current.status).toBe("anonymous")
  })
})
