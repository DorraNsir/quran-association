import type { Metadata } from "next"

import { CalendarView, type CalendarFilters } from "@/components/calendar/calendar-view"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"

export const metadata: Metadata = { title: "الرزنامة" }

/** ?branch=, ?teacher=, ?group= pre-filter the calendar (links from profiles). */
export default async function CalendarPage(props: PageProps<"/admin/calendar">) {
  const params = await props.searchParams
  const pick = (key: string, ids: string[]) => {
    const value = params[key]
    return typeof value === "string" && ids.includes(value) ? value : undefined
  }
  const initialFilters: Partial<CalendarFilters> = Object.fromEntries(
    Object.entries({
      branch: pick("branch", lookups.branches.map((b) => b.id)),
      teacher: pick("teacher", lookups.teachers.map((t) => t.id)),
      group: pick("group", lookups.groups.map((g) => g.id)),
    }).filter(([, v]) => v !== undefined)
  )

  return (
    <CalendarView lookups={lookups} students={students} today={MOCK_TODAY} initialFilters={initialFilters} />
  )
}
