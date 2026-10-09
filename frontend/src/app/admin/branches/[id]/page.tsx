import type { Metadata } from "next"

import { BranchDetails } from "@/components/branches/branch-details"

export const metadata: Metadata = { title: "الفرع" }

export default async function BranchDetailsPage(props: PageProps<"/admin/branches/[id]">) {
  const { id } = await props.params
  return <BranchDetails id={id} />
}
