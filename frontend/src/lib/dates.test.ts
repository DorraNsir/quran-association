import { afterEach, describe, expect, it, vi } from "vitest"

import { addDays, todayInTunis, tunisDateOf, tunisTimeOf } from "./dates"

afterEach(() => vi.useRealTimers())

describe("Africa/Tunis calendar (UTC+1, no DST)", () => {
  it("an instant late in the UTC evening is already the next day in Tunis", () => {
    expect(tunisDateOf("2026-10-08T23:30:00Z")).toBe("2026-10-09")
    expect(tunisTimeOf("2026-10-08T23:30:00Z")).toBe("00:30")
    expect(tunisDateOf("2026-10-08T22:59:59Z")).toBe("2026-10-08")
  })

  it("today follows the Tunis clock, not the browser's", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-12-31T23:15:00Z"))
    expect(todayInTunis()).toBe("2027-01-01")
  })

  it("date-only values are never shifted by date arithmetic", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26")
  })
})
