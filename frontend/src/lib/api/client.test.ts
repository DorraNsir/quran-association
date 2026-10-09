import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authResponse, json, mockFetch } from "@/test/fetch-mock"

import { api, buildQuery, fetchAll, setSessionExpiredHandler } from "./client"
import { ApiError } from "./errors"
import { clearSession, getAccessToken, getSessionUser, login, logout, refreshSession, setSession } from "./session"

beforeEach(() => {
  clearSession()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => setSessionExpiredHandler(null))

describe("api client", () => {
  it("sends JSON with the in-memory Bearer token to NEXT_PUBLIC_API_URL", async () => {
    setSession(authResponse("u1"))
    const { calls } = mockFetch(json(200, { ok: true }))
    await expect(api("/admin/branches", { method: "POST", body: { name: "فرع" }, query: { page: 2, search: "" } })).resolves.toEqual({ ok: true })
    expect(calls[0].url).toBe("http://api.test/api/admin/branches?page=2")
    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer token-u1")
    expect(headers["Content-Type"]).toBe("application/json")
    expect(calls[0].init?.credentials).toBe("include")
  })

  it("never sends the token when auth is false (public endpoints)", async () => {
    setSession(authResponse("u1"))
    const { calls } = mockFetch(json(200, {}))
    await api("/public/site-settings", { auth: false })
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it("refreshes once on 401 and retries the request with the new token", async () => {
    setSession(authResponse("old"))
    const { calls } = mockFetch(json(401, { code: "UNAUTHENTICATED" }), json(200, authResponse("new")), json(200, { value: 1 }))
    await expect(api("/auth/me")).resolves.toEqual({ value: 1 })
    expect(calls.map((c) => c.url)).toEqual([
      "http://api.test/api/auth/me",
      "http://api.test/api/auth/refresh",
      "http://api.test/api/auth/me",
    ])
    expect((calls[2].init?.headers as Record<string, string>).Authorization).toBe("Bearer token-new")
  })

  it("coordinates concurrent refreshes: one /auth/refresh for parallel 401s", async () => {
    setSession(authResponse("old"))
    let refreshes = 0
    const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url)
      if (path.endsWith("/auth/refresh")) {
        refreshes++
        await new Promise((r) => setTimeout(r, 10))
        return json(200, authResponse("new"))
      }
      const auth = (init?.headers as Record<string, string>).Authorization
      return auth === "Bearer token-new" ? json(200, { path }) : json(401, {})
    })
    vi.stubGlobal("fetch", fn)
    const results = await Promise.all([api("/a"), api("/b"), api("/c")])
    expect(results).toHaveLength(3)
    expect(refreshes).toBe(1)
  })

  it("a failed refresh clears the session, notifies the auth layer and throws SESSION_EXPIRED", async () => {
    setSession(authResponse("u1"))
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    mockFetch(json(401, {}), json(401, { code: "SESSION_INVALID" }))
    const error = await api("/admin/students").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe("SESSION_EXPIRED")
    expect((error as ApiError).message).toMatch(/انتهت الجلسة/)
    expect(getAccessToken()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
  })

  it("normalizes API errors to Arabic (server message, validation details, unknown status)", async () => {
    mockFetch(
      json(409, { code: "USERNAME_TAKEN", message: "اسم المستخدم مستعمل" }),
      json(400, { message: ["الاسم مطلوب", "العنوان مطلوب"] }),
      json(500, "boom")
    )
    const conflict = (await api("/x").catch((e: unknown) => e)) as ApiError
    expect(conflict).toMatchObject({ status: 409, code: "USERNAME_TAKEN", message: "اسم المستخدم مستعمل" })
    const validation = (await api("/x").catch((e: unknown) => e)) as ApiError
    expect(validation.status).toBe(400)
    expect(validation.details).toEqual(["الاسم مطلوب", "العنوان مطلوب"])
    expect(validation.message).toMatch(/الاسم مطلوب/)
    const server = (await api("/x").catch((e: unknown) => e)) as ApiError
    expect(server.status).toBe(500)
    expect(server.message).toMatch(/[؀-ۿ]/)
  })

  it("maps a network failure to an Arabic NETWORK_ERROR, and lets aborts through", async () => {
    mockFetch(new TypeError("Failed to fetch"))
    const error = (await api("/x").catch((e: unknown) => e)) as ApiError
    expect(error.code).toBe("NETWORK_ERROR")
    expect(error.message).toMatch(/تعذّر الاتصال/)

    const abort = new DOMException("aborted", "AbortError")
    mockFetch(abort)
    await expect(api("/x")).rejects.toBe(abort)
  })

  it("fetchAll walks every page (100 per request)", async () => {
    const { calls } = mockFetch(
      json(200, { data: [1, 2], meta: { page: 1, pageSize: 100, total: 3, totalPages: 2 } }),
      json(200, { data: [3], meta: { page: 2, pageSize: 100, total: 3, totalPages: 2 } })
    )
    await expect(fetchAll<number>("/admin/rooms")).resolves.toEqual([1, 2, 3])
    expect(calls[1].url).toContain("page=2&pageSize=100")
  })

  it("fetchAll also accepts a non-paginated list (one request)", async () => {
    const { calls } = mockFetch(json(200, [{ id: "y1" }, { id: "y2" }]))
    await expect(fetchAll("/admin/academic-years")).resolves.toEqual([{ id: "y1" }, { id: "y2" }])
    expect(calls).toHaveLength(1)
  })

  it("buildQuery skips empty values and repeats arrays", () => {
    expect(buildQuery({ a: 1, b: undefined, c: null, d: "", e: ["x", "y"], f: false })).toBe("?a=1&e=x&e=y&f=false")
    expect(buildQuery({})).toBe("")
  })
})

describe("session", () => {
  it("login keeps the access token in memory only (no web storage)", async () => {
    mockFetch(json(200, authResponse("admin")))
    const user = await login("admin", "secret-123")
    expect(user.roles).toEqual(["ADMIN"])
    expect(getAccessToken()).toBe("token-admin")
    expect(Object.keys(localStorage)).toEqual([])
    expect(Object.keys(sessionStorage)).toEqual([])
  })

  it("login failures carry the API's Arabic code (invalid credentials, disabled account)", async () => {
    mockFetch(json(401, { code: "INVALID_CREDENTIALS" }), json(403, { code: "ACCOUNT_INACTIVE" }))
    await expect(login("a", "b")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", message: expect.stringMatching(/غير صحيحة/) })
    await expect(login("a", "b")).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE", message: expect.stringMatching(/معطّل/) })
    expect(getSessionUser()).toBeNull()
  })

  it("refreshSession restores the user from the cookie, or resolves null without one", async () => {
    mockFetch(json(200, authResponse("u2", ["TEACHER"])))
    await expect(refreshSession()).resolves.toMatchObject({ id: "u2" })
    mockFetch(json(401, {}))
    await expect(refreshSession()).resolves.toBeNull()
    expect(getAccessToken()).toBeNull()
  })

  it("logout revokes server-side and clears memory even if the API is unreachable", async () => {
    setSession(authResponse("u1"))
    const { calls } = mockFetch(new TypeError("offline"))
    await logout()
    expect(calls[0].url).toBe("http://api.test/api/auth/logout")
    expect(calls[0].init?.credentials).toBe("include")
    expect(getAccessToken()).toBeNull()
    expect(getSessionUser()).toBeNull()
  })
})
