import type { Metadata } from "next"

import { StaffResources } from "@/components/communication/resources-views"
import { getCurrentUser } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, publisherNames } from "@/lib/mock"

export const metadata: Metadata = { title: "الموارد" }

export default async function AdminResourcesPage() {
  const user = await getCurrentUser()
  return <StaffResources workspace="admin" user={user} lookups={lookups} publishers={publisherNames} today={MOCK_TODAY} />
}
