import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api/errors"

import { QueryState } from "./query-state"

const query = (over: object) => ({ isPending: false, isError: false, error: null, refetch: vi.fn(), ...over })

describe("loading / error / empty / unauthorized states", () => {
  it("shows a loader while pending", () => {
    render(<QueryState query={query({ isPending: true })}>content</QueryState>)
    expect(screen.getByRole("status").textContent).toContain("جارٍ التحميل")
  })

  it("shows the Arabic error with a retry", () => {
    render(<QueryState query={query({ isError: true, error: new ApiError(500, "HTTP_500", "حدث خطأ في الخادم") })}>content</QueryState>)
    expect(screen.getByText("تعذّر تحميل البيانات")).toBeTruthy()
    expect(screen.getByRole("button", { name: /إعادة المحاولة/ })).toBeTruthy()
  })

  it("a 403 is an access message without retry", () => {
    render(<QueryState query={query({ isError: true, error: new ApiError(403, "FORBIDDEN_ROLE", "لا تملك صلاحية") })}>content</QueryState>)
    expect(screen.getByText("ليس لديك صلاحية للوصول إلى هذه البيانات")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("empty, then content", () => {
    const { rerender } = render(<QueryState query={query({})} empty emptyTitle="لا توجد بيانات">content</QueryState>)
    expect(screen.getByText("لا توجد بيانات")).toBeTruthy()
    rerender(<QueryState query={query({})}>content</QueryState>)
    expect(screen.getByText("content")).toBeTruthy()
  })
})
