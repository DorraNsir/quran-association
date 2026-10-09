import { vi } from "vitest"

/** A queue of fetch responses; records every request (url, init). */
export function mockFetch(...responses: (Response | (() => Response) | Error | DOMException)[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const next = responses.shift()
    if (!next) throw new Error(`Unexpected fetch ${String(url)}`)
    if (next instanceof Error || next instanceof DOMException) throw next
    return typeof next === "function" ? next() : next
  })
  vi.stubGlobal("fetch", fn)
  return { fn, calls }
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })

export const authResponse = (id: string, roles: ("ADMIN" | "TEACHER" | "STUDENT")[] = ["ADMIN"], extra: object = {}) => ({
  accessToken: `token-${id}`,
  expiresIn: 900,
  user: {
    id,
    username: id,
    person: { id: `p-${id}`, firstName: "س", lastName: "ع", photoUrl: null, email: null, phone: null },
    roles,
    mustChangePassword: false,
    teacherId: roles.includes("TEACHER") ? `t-${id}` : null,
    studentId: roles.includes("STUDENT") ? `s-${id}` : null,
    ...extra,
  },
})
