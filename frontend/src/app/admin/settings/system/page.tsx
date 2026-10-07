import type { Metadata } from "next"

import { SystemSettingsForm } from "@/components/settings/settings-forms"

export const metadata: Metadata = { title: "إعدادات النظام" }

export default function SystemSettingsPage() {
  return <SystemSettingsForm />
}
