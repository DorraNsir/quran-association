import { screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json, mockFetch } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { UserAvatar } from "./user-avatar"

afterEach(() => clearSession())

describe("UserAvatar (student photos in lists)", () => {
  it("no photo: a round placeholder with the first letter only, hidden from screen readers", () => {
    const { calls } = mockFetch()
    const { container } = renderWithClient(<UserAvatar name="أحمد بن صالح" />)
    const letter = screen.getByText("أ")
    expect(letter.getAttribute("aria-hidden")).toBe("true")
    expect(container.querySelector("[data-slot=avatar]")!.className).toMatch(/rounded-full/)
    expect(calls).toHaveLength(0)
  })

  it("a private photo is fetched with the signed-in user's token (never a public URL)", async () => {
    setSession(authResponse("u1", ["TEACHER"]))
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:http://localhost/p"), revokeObjectURL: vi.fn() }))
    const { calls } = mockFetch(new Response(new Blob(["png"]), { status: 200 }))
    renderWithClient(<UserAvatar name="أحمد" photoUrl="/api/files/f1" />)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.url).toBe("http://api.test/api/files/f1")
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer token-u1")
    // the letter stays until the image has loaded
    expect(screen.getByText("أ")).toBeTruthy()
  })

  it("no access (403) or a missing file (404): the letter, no broken image", async () => {
    setSession(authResponse("u1", ["TEACHER"]))
    for (const status of [403, 404]) {
      const { calls } = mockFetch(json(status, { code: "X", message: "x" }))
      const { unmount, container } = renderWithClient(<UserAvatar name="سارة" photoUrl="/api/files/f2" />)
      await waitFor(() => expect(calls).toHaveLength(1))
      expect(screen.getByText("س")).toBeTruthy()
      expect(container.querySelector("img")).toBeNull()
      unmount()
    }
  })
})
