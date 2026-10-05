import type { Metadata } from "next"

import { GroupsView } from "@/components/groups/groups-view"
import { lookups, students } from "@/lib/mock"

export const metadata: Metadata = { title: "المجموعات" }

export default function GroupsPage() {
  return <GroupsView lookups={lookups} initialStudents={students} />
}
