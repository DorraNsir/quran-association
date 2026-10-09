import type { Metadata } from "next"

import { StudentsScreen } from "@/components/admin/admin-screens"

export const metadata: Metadata = { title: "الطلبة" }

export default async function StudentsPage(props: PageProps<"/admin/students">) {
  // ?group=<id> pre-filters the list (used by links from group pages)
  const { group } = await props.searchParams
  return <StudentsScreen groupId={typeof group === "string" ? group : undefined} />
}
