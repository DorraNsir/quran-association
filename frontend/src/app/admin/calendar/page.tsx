import type { Metadata } from "next"

import { CalendarScreen } from "@/components/calendar/calendar-screen"

export const metadata: Metadata = { title: "الرزنامة" }

/** ?branch=, ?teacher=, ?group= pre-filter the calendar (links from profiles). */
export default async function CalendarPage(props: PageProps<"/admin/calendar">) {
  const params = await props.searchParams
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined)
  return <CalendarScreen params={{ branch: one("branch"), teacher: one("teacher"), group: one("group") }} />
}
