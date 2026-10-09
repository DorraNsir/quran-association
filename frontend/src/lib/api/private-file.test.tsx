import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { authResponse, mockFetch } from "@/test/fetch-mock"
import { testQueryClient, wrapperFor } from "@/test/render"

import { isPrivateFile, usePrivateFileUrl } from "./private-file"
import { clearSession, setSession } from "./session"

describe("private media", () => {
  it("fetches a private file with the Bearer token and revokes its object URL on unmount", async () => {
    setSession(authResponse("admin"))
    const create = vi.fn(() => "blob:http://localhost/photo")
    const revoke = vi.fn()
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
    const { calls } = mockFetch(new Response(new Blob(["png"]), { status: 200 }))
    const { result, unmount } = renderHook(() => usePrivateFileUrl("/api/files/abc"), { wrapper: wrapperFor(testQueryClient()) })
    await waitFor(() => expect(result.current.src).toBe("blob:http://localhost/photo"))
    expect(calls[0].url).toBe("http://api.test/api/files/abc")
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer token-admin")
    expect(calls[0].init?.cache).toBe("no-store")
    unmount()
    expect(revoke).toHaveBeenCalledWith("blob:http://localhost/photo")
    clearSession()
  })

  it("public and bundled media pass through without any request", () => {
    const { calls } = mockFetch()
    const { result } = renderHook(() => usePrivateFileUrl("/website/hero.jpg"), { wrapper: wrapperFor(testQueryClient()) })
    expect(result.current.src).toBe("/website/hero.jpg")
    expect(calls).toHaveLength(0)
    expect(isPrivateFile("/api/public/files/x")).toBe(false)
    expect(isPrivateFile("/api/files/x")).toBe(true)
  })
})
