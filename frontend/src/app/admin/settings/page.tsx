import type { Metadata } from "next"

import { SettingsOverview } from "@/components/settings/settings-shell"

export const metadata: Metadata = { title: "الإعدادات" }

export default function SettingsPage() {
  return <SettingsOverview />
}
