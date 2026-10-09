/**
 * Turning recurring weekly schedules into dated sessions.
 * Frontend illustration only — the NestJS backend will generate and own
 * sessions (holidays, exceptions, rescheduling…).
 */
import { eachDate, weekdayOf } from "@/lib/dates"
import { indexById, isRunning } from "@/lib/domain"
import type { Group, GroupClass, ID, ISODate, Session, WeeklySchedule } from "@/types/domain"

/** Stable id: one session per weekly slot per date. */
export function sessionIdFor(scheduleId: ID, date: ISODate) {
  return `se-${scheduleId}-${date}`
}

/** Every dated occurrence of running classes' weekly slots between two dates. */
export function generateSessions(
  schedules: WeeklySchedule[],
  data: { groupClasses: GroupClass[]; groups: Group[] },
  range: { from: ISODate; to: ISODate }
): Session[] {
  const classesById = indexById(data.groupClasses)
  const groupsById = indexById(data.groups)
  const active = schedules.filter((s) => isRunning(classesById.get(s.groupClassId), groupsById))
  return eachDate(range.from, range.to).flatMap((date) =>
    active
      .filter((s) => s.day === weekdayOf(date))
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((s) => ({
        id: sessionIdFor(s.id, date),
        groupClassId: s.groupClassId,
        scheduleId: s.id,
        roomId: s.roomId,
        date,
        start: s.start,
        end: s.end,
        status: "SCHEDULED" as const,
      }))
  )
}
