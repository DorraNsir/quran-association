import type { Metadata } from "next"

import { SessionsView, type SessionTab } from "@/components/sessions/sessions-view"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"

export const metadata: Metadata = { title: "الحصص" }

const TABS: SessionTab[] = ["today", "pending", "upcoming", "done", "cancelled", "all"]

/** ?tab=pending opens a specific list (used by dashboard links). */
export default async function SessionsPage(props: PageProps<"/admin/sessions">) {
  const { tab } = await props.searchParams
  const initialTab = TABS.find((t) => t === tab)
  return <SessionsView lookups={lookups} students={students} today={MOCK_TODAY} initialTab={initialTab} />
}
