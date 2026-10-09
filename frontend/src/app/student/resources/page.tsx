import type { Metadata } from "next"

import { StudentResources } from "@/components/communication/resources-views"

export const metadata: Metadata = { title: "الموارد" }

/** The API returns only the resources the signed-in student may see. */
export default function Page() {
  return <StudentResources />
}
