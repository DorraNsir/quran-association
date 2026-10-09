import type { Metadata } from "next"

import { GroupsPage } from "@/components/website/pages"

export const metadata: Metadata = { title: "المجموعات", description: "مجموعات وأقسام جديدة ستفتح قريباً — سجّل اهتمامك." }

export default function GroupsPageRoute() {
  return <GroupsPage />
}
