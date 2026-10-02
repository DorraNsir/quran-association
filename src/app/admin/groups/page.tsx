import type { Metadata } from "next"

import { GroupsView } from "@/components/groups/groups-view"
import { branches, groups, students, teachers } from "@/lib/mock"

export const metadata: Metadata = { title: "المجموعات" }

export default function GroupsPage() {
  return <GroupsView lookups={{ branches, groups, teachers }} initialStudents={students} />
}
