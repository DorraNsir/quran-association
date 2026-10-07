import type { Metadata } from "next"

import { SiteSettingsForm } from "@/components/cms/cms-sections"

export const metadata: Metadata = { title: "إعدادات الموقع" }

export default function WebsiteSettingsPage() {
  return <SiteSettingsForm />
}
