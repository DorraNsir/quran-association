import type { Metadata } from "next"

import { StaffResourcesScreen } from "@/components/communication/communication-screens"

export const metadata: Metadata = { title: "الموارد" }

export default function Page() {
  return <StaffResourcesScreen workspace="teacher" />
}
