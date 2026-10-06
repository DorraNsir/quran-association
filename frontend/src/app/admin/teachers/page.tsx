import type { Metadata } from "next"

import { TeachersView } from "@/components/teachers/teachers-view"
import { lookups, teachers, users } from "@/lib/mock"

export const metadata: Metadata = { title: "المعلمون" }

export default function TeachersPage() {
  // Teachers whose account also holds the ADMIN role
  const adminTeacherIds = users.flatMap((u) => (u.roles.includes("ADMIN") && u.teacherId ? [u.teacherId] : []))

  return (
    <TeachersView
      initialTeachers={teachers}
      lookups={lookups}
      adminTeacherIds={adminTeacherIds}
    />
  )
}
