/**
 * Fixed "today" for the mock phase, so ages, "today's sessions" and
 * "recent registrations" stay consistent between builds and the demo.
 * Replace with the real current date once data comes from the API.
 */
export const MOCK_TODAY = "2026-10-02"

/** Temporary client-side id for records created in the mock phase (the API will assign ids). */
let mockSequence = 0
export function newMockId(prefix: string) {
  mockSequence += 1
  return `${prefix}-new-${Date.now().toString(36)}-${mockSequence}`
}

/**
 * Current academic year, used only for attendance period filters.
 * A full Academic Years module comes in a later phase.
 */
export const ACADEMIC_YEAR = {
  label: "2026–2027",
  start: "2026-09-14",
  end: "2027-06-30",
  terms: [
    { id: "t1", label: "الثلاثي الأول", start: "2026-09-14", end: "2026-12-20" },
    { id: "t2", label: "الثلاثي الثاني", start: "2027-01-04", end: "2027-03-14" },
    { id: "t3", label: "الثلاثي الثالث", start: "2027-03-29", end: "2027-06-30" },
  ],
}
