import type { Metadata } from "next"

import { GroupsScreen } from "@/components/admin/admin-screens"

export const metadata: Metadata = { title: "المجموعات" }

export default function Page() {
  return <GroupsScreen />
}
