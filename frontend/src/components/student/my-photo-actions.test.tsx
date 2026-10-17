import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json } from "@/test/fetch-mock"
import { renderWithClient } from "@/test/render"

import { MyPhotoActions } from "./my-photo-actions"

const reload = vi.fn(async () => {})
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ reload }) }))
// Uploads go through XMLHttpRequest (progress): stubbed, the attach call stays on fetch
const uploads: { path: string; query: unknown }[] = []
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  uploadFile: vi.fn(async (path: string, query: unknown) => {
    uploads.push({ path, query })
    return { id: "f1" }
  }),
}))

/** Records every request (method + path). */
function routeFetch() {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`)
      if (url.pathname.endsWith("/files")) return json(201, { id: "f1" })
      return json(200, { photoFileId: "f1", photoUrl: "/api/files/f1", personId: "p1" })
    })
  )
  return calls
}

const pick = (file: File) => fireEvent.change(screen.getByLabelText("صورتي الشخصية"), { target: { files: [file] } })

beforeEach(() => {
  clearSession()
  setSession(authResponse("u1", ["STUDENT"]))
  reload.mockClear()
  uploads.length = 0
})

describe("student profile — my photo (the only editable field)", () => {
  it("uploads the picked image as PROFILE_PHOTO, then attaches it to MY profile", async () => {
    const calls = routeFetch()
    renderWithClient(<MyPhotoActions hasPhoto={false} />)
    pick(new File(["x"], "me.png", { type: "image/png" }))
    await waitFor(() => expect(calls).toContain("PUT /api/student/profile/photo"))
    expect(uploads).toEqual([{ path: "/files", query: { purpose: "PROFILE_PHOTO" } }])
    await waitFor(() => expect(reload).toHaveBeenCalled())
  })

  it("refuses a non-image file without calling the API", () => {
    const calls = routeFetch()
    renderWithClient(<MyPhotoActions hasPhoto={false} />)
    pick(new File(["x"], "doc.pdf", { type: "application/pdf" }))
    expect(calls).toHaveLength(0)
    expect(uploads).toHaveLength(0)
  })

  it("removes my photo", async () => {
    const calls = routeFetch()
    renderWithClient(<MyPhotoActions hasPhoto />)
    fireEvent.click(screen.getByRole("button", { name: "حذف الصورة" }))
    await waitFor(() => expect(calls).toContain("DELETE /api/student/profile/photo"))
  })
})
