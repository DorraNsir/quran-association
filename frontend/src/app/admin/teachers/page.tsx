import type { Metadata } from "next"

import { TeachersScreen } from "@/components/teachers/teachers-screen"

export const metadata: Metadata = { title: "المعلمون" }

export default function TeachersPage() {
  return <TeachersScreen />
}
