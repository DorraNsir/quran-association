import type { Metadata } from "next"

import { GroupDetails } from "@/components/groups/group-details"

export const metadata: Metadata = { title: "المجموعة" }

export default async function GroupDetailsPage(props: PageProps<"/admin/groups/[id]">) {
  const { id } = await props.params
  return <GroupDetails id={id} />
}
