import type { Metadata } from "next"

import { MemorizationOverview } from "@/components/memorization/memorization-overview"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"

export const metadata: Metadata = { title: "متابعة الحفظ" }

export default function MemorizationPage() {
  return <MemorizationOverview lookups={lookups} students={students} today={MOCK_TODAY} />
}
