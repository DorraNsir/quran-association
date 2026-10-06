import type { Metadata } from "next"

import { ResourceDetails } from "@/components/communication/resources-views"
import { getCurrentUser } from "@/lib/auth/current-user"
import { lookups, MOCK_TODAY, publisherNames } from "@/lib/mock"

export const metadata: Metadata = { title: "المورد" }

/** Resolved client-side from the shared store (resources created in this session included). */
export default async function AdminResourcePage(props: PageProps<"/admin/resources/[id]">) {
  const { id } = await props.params
  const user = await getCurrentUser()
  return <ResourceDetails resourceId={id} viewer={{ workspace: "admin", user }} lookups={lookups} publishers={publisherNames} today={MOCK_TODAY} />
}
