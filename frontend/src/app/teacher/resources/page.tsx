import type { Metadata } from "next"

import { StaffResources } from "@/components/communication/resources-views"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, publisherNames } from "@/lib/mock"

export const metadata: Metadata = { title: "الموارد" }

export default async function TeacherResourcesPage() {
  const { user } = await getCurrentTeacher()
  return <StaffResources workspace="teacher" user={user} lookups={lookups} publishers={publisherNames} today={MOCK_TODAY} />
}
