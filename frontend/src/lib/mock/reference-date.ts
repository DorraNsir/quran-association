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
