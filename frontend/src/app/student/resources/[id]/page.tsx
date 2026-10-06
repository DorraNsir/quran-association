import type { Metadata } from "next"

import { ResourceDetails } from "@/components/communication/resources-views"
import { StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, publisherNames } from "@/lib/mock"

export const metadata: Metadata = { title: "المورد" }

/** The id names a resource, never a student: access is checked against the current student. */
export default async function StudentResourcePage(props: PageProps<"/student/resources/[id]">) {
  const { id } = await props.params
  const { student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  return <ResourceDetails resourceId={id} viewer={{ workspace: "student", student }} lookups={lookups} publishers={publisherNames} today={MOCK_TODAY} />
}
