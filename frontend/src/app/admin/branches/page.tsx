import type { Metadata } from "next"

import { BranchesScreen } from "@/components/admin/admin-screens"

export const metadata: Metadata = { title: "الفروع" }

export default function Page() {
  return <BranchesScreen />
}
