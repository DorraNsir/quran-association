"use client"

import { WithLookupsAndStudents } from "@/components/shared/with-admin-data"
import { todayInTunis } from "@/lib/dates"

import { CalendarView, type CalendarFilters } from "./calendar-view"

/** ?branch=, ?teacher=, ?group= pre-filter the calendar (links from profiles); unknown ids are ignored. */
export function CalendarScreen({ params }: { params: Partial<Record<"branch" | "teacher" | "group", string>> }) {
  return (
    <WithLookupsAndStudents>
      {(lookups, students) => {
        const pick = (value: string | undefined, ids: string[]) => (value && ids.includes(value) ? value : undefined)
        const initialFilters: Partial<CalendarFilters> = Object.fromEntries(
          Object.entries({
            branch: pick(params.branch, lookups.branches.map((b) => b.id)),
            teacher: pick(params.teacher, lookups.teachers.map((t) => t.id)),
            group: pick(params.group, lookups.groups.map((g) => g.id)),
          }).filter(([, v]) => v !== undefined)
        )
        return <CalendarView lookups={lookups} students={students} today={todayInTunis()} initialFilters={initialFilters} />
      }}
    </WithLookupsAndStudents>
  )
}
