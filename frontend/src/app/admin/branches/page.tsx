import type { Metadata } from "next"

import { BranchesView } from "@/components/branches/branches-view"
import { lookups } from "@/lib/mock"

export const metadata: Metadata = { title: "الفروع" }

export default function BranchesPage() {
  return <BranchesView lookups={lookups} />
}
