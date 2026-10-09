import type { Metadata } from "next"

import { ResourceDetails } from "@/components/communication/resources-views"

export const metadata: Metadata = { title: "المورد" }

/** The id names a resource, never a student: the API checks access for the signed-in student. */
export default async function Page(props: PageProps<"/student/resources/[id]">) {
  const { id } = await props.params
  return <ResourceDetails resourceId={id} workspace="student" />
}
