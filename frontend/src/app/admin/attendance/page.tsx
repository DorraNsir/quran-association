import type { Metadata } from "next"

import { AttendanceScreen } from "@/components/admin/admin-screens"

export const metadata: Metadata = { title: "متابعة الحضور" }

export default function Page() {
  return <AttendanceScreen />
}
