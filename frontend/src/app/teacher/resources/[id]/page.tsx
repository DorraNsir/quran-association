import type { Metadata } from "next"

import { ResourceDetails } from "@/components/communication/resources-views"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, publisherNames } from "@/lib/mock"

export const metadata: Metadata = { title: "المورد" }

export default async function TeacherResourcePage(props: PageProps<"/teacher/resources/[id]">) {
  const { id } = await props.params
  const { user } = await getCurrentTeacher()
  return <ResourceDetails resourceId={id} viewer={{ workspace: "teacher", user }} lookups={lookups} publishers={publisherNames} today={MOCK_TODAY} />
}
