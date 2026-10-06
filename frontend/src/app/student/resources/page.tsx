import type { Metadata } from "next"

import { StudentResources } from "@/components/communication/resources-views"
import { StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, publisherNames } from "@/lib/mock"

export const metadata: Metadata = { title: "الموارد" }

export default async function StudentResourcesPage() {
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  return <StudentResources student={student} lookups={lookups} publishers={publisherNames} today={MOCK_TODAY} />
}
