import type { Metadata } from "next"

import { AcademicYearSettings } from "@/components/settings/academic-year-settings"

export const metadata: Metadata = { title: "السنة الدراسية" }

export default function AcademicYearSettingsPage() {
  return <AcademicYearSettings />
}
