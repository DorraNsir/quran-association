"use client"

import { WithLookups } from "@/components/shared/with-lookups"
import { WithTeacherWorkspace } from "@/components/shared/with-workspace"
import { todayInTunis } from "@/lib/dates"

import { SessionsView, type SessionTab } from "./sessions-view"

const TABS: SessionTab[] = ["today", "pending", "upcoming", "done", "cancelled", "all"]
const tabOf = (tab?: string) => TABS.find((t) => t === tab)

/** /admin/sessions (?tab=pending opens a specific list — used by dashboard links). */
export function AdminSessionsScreen({ tab }: { tab?: string }) {
  return <WithLookups>{(lookups) => <SessionsView lookups={lookups} today={todayInTunis()} initialTab={tabOf(tab)} />}</WithLookups>
}

/** /teacher/sessions: the API returns only the teacher's sessions; filters use their own classes. */
export function TeacherSessionsScreen({ tab }: { tab?: string }) {
  return (
    <WithTeacherWorkspace>
      {({ lookups }) => <SessionsView workspace="teacher" lookups={lookups} today={todayInTunis()} initialTab={tabOf(tab)} />}
    </WithTeacherWorkspace>
  )
}
