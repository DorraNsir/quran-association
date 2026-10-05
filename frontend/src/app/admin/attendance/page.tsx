import type { Metadata } from "next"

import { AttendanceOverview } from "@/components/attendance/attendance-overview"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"

export const metadata: Metadata = { title: "متابعة الحضور" }

export default function AttendancePage() {
  return <AttendanceOverview lookups={lookups} students={students} today={MOCK_TODAY} />
}
