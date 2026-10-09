import type { Metadata } from "next"

import { AdminStudentProfile } from "@/components/students/admin-student-profile"
import { STUDENT_PROFILE_TABS } from "@/components/students/student-profile"

export const metadata: Metadata = { title: "ملف الطالب" }

export default async function StudentProfilePage(props: PageProps<"/admin/students/[id]">) {
  const { id } = await props.params
  // ?tab=memorization|attendance|payments opens a tab directly
  const { tab } = await props.searchParams
  const initialTab = typeof tab === "string" && STUDENT_PROFILE_TABS.includes(tab) ? tab : undefined
  return <AdminStudentProfile id={id} initialTab={initialTab} />
}
