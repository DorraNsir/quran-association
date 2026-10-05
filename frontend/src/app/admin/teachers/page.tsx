import type { Metadata } from "next"

import { TeachersView } from "@/components/teachers/teachers-view"
import { currentUser, lookups, teachers } from "@/lib/mock"

export const metadata: Metadata = { title: "المعلمون" }

export default function TeachersPage() {
  const adminTeacherIds = currentUser.roles.includes("ADMIN") && currentUser.teacherId
    ? [currentUser.teacherId]
    : []

  return (
    <TeachersView
      initialTeachers={teachers}
      lookups={lookups}
      adminTeacherIds={adminTeacherIds}
    />
  )
}
