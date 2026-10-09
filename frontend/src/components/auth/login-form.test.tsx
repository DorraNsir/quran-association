import { QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DirectionProvider } from "@/components/ui/direction"
import { clearSession } from "@/lib/api/session"
import { AuthProvider } from "@/lib/auth/auth-provider"
import { authResponse, json } from "@/test/fetch-mock"
import { testQueryClient } from "@/test/render"

import { LoginForm } from "./login-form"

const replace = vi.fn()
let search = new URLSearchParams()
// Bundled logo imports have no dimensions under Vitest
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search,
}))

/** Routes the fetches of the login page: no refresh cookie, public settings, then the login answer. */
function api(loginAnswer: Response) {
  const fn = vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url)
    if (path.endsWith("/auth/refresh")) return json(401, {})
    if (path.endsWith("/public/site-settings")) return json(200, { name: "الفرع المحلي عمر بن الخطاب" })
    if (path.endsWith("/auth/login")) return loginAnswer.clone()
    throw new Error(path)
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

function renderLogin() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <DirectionProvider dir="rtl">
        <AuthProvider>
          <LoginForm />
        </AuthProvider>
      </DirectionProvider>
    </QueryClientProvider>
  )
}

async function submit(username: string, password: string) {
  const user = await screen.findByLabelText(/اسم المستخدم/)
  fireEvent.change(user, { target: { value: username } })
  fireEvent.change(screen.getByLabelText(/^كلمة المرور/), { target: { value: password } })
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /دخول/ }))
  })
}

beforeEach(() => {
  clearSession()
  replace.mockReset()
  search = new URLSearchParams()
})

describe("login page", () => {
  it("validates in Arabic before calling the API", async () => {
    const fetch = api(json(200, authResponse("x")))
    renderLogin()
    await submit("", "")
    expect(screen.getByText("أدخل اسم المستخدم")).toBeTruthy()
    expect(screen.getByText("أدخل كلمة المرور")).toBeTruthy()
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith("/auth/login"))).toBe(false)
  })

  it("shows the invalid-credentials message and clears the password", async () => {
    api(json(401, { code: "INVALID_CREDENTIALS" }))
    renderLogin()
    await submit("admin", "wrong-pass")
    expect(await screen.findByText(/اسم المستخدم أو كلمة المرور غير صحيحة/)).toBeTruthy()
    expect((screen.getByLabelText(/^كلمة المرور/) as HTMLInputElement).value).toBe("")
  })

  it("explains a disabled account", async () => {
    api(json(403, { code: "ACCOUNT_INACTIVE" }))
    renderLogin()
    await submit("old-teacher", "secret-123")
    expect(await screen.findByText(/هذا الحساب معطّل/)).toBeTruthy()
  })

  it("redirects by role after login", async () => {
    api(json(200, authResponse("t", ["TEACHER"])))
    renderLogin()
    await submit("teacher", "secret-123")
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/teacher"))
  })

  it("sends a temporary password to the mandatory change first", async () => {
    search = new URLSearchParams("next=/student/payments")
    api(json(200, authResponse("s", ["STUDENT"], { mustChangePassword: true })))
    renderLogin()
    await submit("student", "temporary-123")
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/change-password?next=%2Fstudent%2Fpayments"))
  })
})
