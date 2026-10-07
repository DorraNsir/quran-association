import type { Metadata } from "next"

import { PreferencesForm } from "@/components/settings/settings-forms"

export const metadata: Metadata = { title: "التفضيلات" }

export default function PreferencesPage() {
  return <PreferencesForm />
}
