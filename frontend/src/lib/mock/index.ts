/**
 * Mock data for the frontend validation phase.
 * Pages import from here; later these imports are replaced by API calls.
 */
import type { Lookups } from "@/lib/domain"

import { branches, rooms } from "./branches"
import { groupClasses, groups } from "./groups"
import { schedules } from "./schedules"
import { teachers } from "./teachers"

export { branches, rooms, groups, groupClasses, schedules, teachers }
export { users, DEFAULT_USER_ID, publisherNames } from "./users"
export { teacherNotes } from "./teacher-notes"
export { announcements, announcementTargets, notifications, resources, resourceTargets } from "./communication"
export { students } from "./students"
export { recentActivity } from "./activity"
export { MOCK_TODAY } from "./reference-date"
export { academicYears, CURRENT_ACADEMIC_YEAR } from "./academic-years"
export { memorizationProgress } from "./memorization"
export { sessions, studentAttendance, teacherAttendance } from "./sessions"

/** The one reference-data bundle every screen resolves ids against. */
export const lookups: Lookups = { branches, rooms, groups, groupClasses, teachers, schedules }
