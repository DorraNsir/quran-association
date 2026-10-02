import type { Metadata } from "next"

import { StudentsView } from "@/components/students/students-view"
import { fullName } from "@/lib/domain"
import { branches, groups, students, teachers } from "@/lib/mock"

export const metadata: Metadata = { title: "الطلبة" }

export default async function StudentsPage(props: PageProps<"/admin/students">) {
  // ?group=<id> pre-filters the list (used by links from group pages)
  const { group } = await props.searchParams
  const initialGroupId = typeof group === "string" && groups.some((g) => g.id === group) ? group : undefined
  const sorted = [...students].sort((a, b) => fullName(a).localeCompare(fullName(b), "ar"))

  return (
    <StudentsView
      initialStudents={sorted}
      initialGroupId={initialGroupId}
      lookups={{ branches, groups, teachers }}
    />
  )
}
