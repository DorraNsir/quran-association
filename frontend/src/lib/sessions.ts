/**
 * Turning recurring weekly schedules into dated sessions.
 * Frontend illustration only — the NestJS backend will generate and own
 * sessions (holidays, exceptions, rescheduling…).
 */
import { eachDate, weekdayOf } from "@/lib/dates"
import { indexById } from "@/lib/domain"
import type { Group, ID, ISODate, Session, WeeklySchedule } from "@/types/domain"

/** Stable id: one session per weekly slot per date. */
export function sessionIdFor(scheduleId: ID, date: ISODate) {
  return `se-${scheduleId}-${date}`
}

/** Every dated occurrence of active groups' weekly slots between two dates. */
export function generateSessions(
  schedules: WeeklySchedule[],
  groups: Group[],
  range: { from: ISODate; to: ISODate }
): Session[] {
  const groupsById = indexById(groups)
  const active = schedules.filter((s) => groupsById.get(s.groupId)?.status === "ACTIVE")
  return eachDate(range.from, range.to).flatMap((date) =>
    active
      .filter((s) => s.day === weekdayOf(date))
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((s) => ({
        id: sessionIdFor(s.id, date),
        groupId: s.groupId,
        scheduleId: s.id,
        date,
        start: s.start,
        end: s.end,
        branchId: s.branchId,
        roomId: s.roomId,
        status: "SCHEDULED" as const,
      }))
  )
}
