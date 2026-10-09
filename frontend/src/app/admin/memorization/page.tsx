import type { Metadata } from "next"

import { MemorizationScreen } from "@/components/admin/admin-screens"

export const metadata: Metadata = { title: "متابعة الحفظ" }

export default function Page() {
  return <MemorizationScreen />
}
