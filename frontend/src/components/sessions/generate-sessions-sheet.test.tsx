import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { useGenerateSessions } from "@/lib/api/sessions"
import { clearSession, setSession } from "@/lib/api/session"
import { authResponse, json, mockFetch } from "@/test/fetch-mock"
import { testQueryClient, wrapperFor } from "@/test/render"

import { defaultGenerationRange } from "./generate-sessions-sheet"

const year = { startDate: "2026-09-14", endDate: "2027-06-30" }

describe("default generation period", () => {
  it("from today to the end of the current academic year", () => {
    expect(defaultGenerationRange("2026-10-09", year)).toEqual({ from: "2026-10-09", to: "2027-06-30" })
  })
  it("starts at the beginning of a year that has not started yet", () => {
    expect(defaultGenerationRange("2026-08-01", year)).toEqual({ from: "2026-09-14", to: "2027-06-30" })
  })
  it("four weeks when no (or an ended) academic year is configured", () => {
    expect(defaultGenerationRange("2026-10-09")).toEqual({ from: "2026-10-09", to: "2026-11-05" })
    expect(defaultGenerationRange("2027-08-01", year)).toEqual({ from: "2027-08-01", to: "2027-08-28" })
  })
  it("never exceeds the API's 366-day limit", () => {
    expect(defaultGenerationRange("2026-01-01", { startDate: "2025-09-01", endDate: "2027-12-31" })).toEqual({
      from: "2026-01-01",
      to: "2027-01-01",
    })
  })
})

describe("useGenerateSessions", () => {
  beforeEach(() => {
    clearSession()
    setSession(authResponse("admin"))
  })

  it("calls the API's idempotent generator and returns its report", async () => {
    const report = { from: "2026-10-09", to: "2027-06-30", created: 3, skippedExisting: 0, skippedConflicts: [], skippedInactiveSupervisorClassIds: [] }
    const { calls } = mockFetch(json(200, report))
    const { result } = renderHook(() => useGenerateSessions(), { wrapper: wrapperFor(testQueryClient()) })
    let res: unknown
    await act(async () => {
      res = await result.current.mutateAsync({ from: "2026-10-09", to: "2027-06-30" })
    })
    expect(res).toEqual(report)
    expect(calls[0].url).toBe("http://api.test/api/admin/sessions/generate")
    expect(calls[0].init?.method).toBe("POST")
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ from: "2026-10-09", to: "2027-06-30" })
  })
})
