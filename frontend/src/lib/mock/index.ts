/**
 * Mock data for the frontend validation phase.
 * Pages import from here; later these imports are replaced by API calls.
 */
import type { Lookups } from "@/lib/domain"

import { branches, rooms } from "./branches"
import { groups } from "./groups"
import { schedules } from "./schedules"
import { teachers } from "./teachers"

export { branches, rooms, groups, schedules, teachers }
export { currentUser } from "./teachers"
export { students } from "./students"
export { recentActivity } from "./activity"
export { ACADEMIC_YEAR, MOCK_TODAY } from "./reference-date"
export { sessions, studentAttendance, teacherAttendance } from "./sessions"

/** The one reference-data bundle every screen resolves ids against. */
export const lookups: Lookups = { branches, rooms, groups, teachers, schedules }
