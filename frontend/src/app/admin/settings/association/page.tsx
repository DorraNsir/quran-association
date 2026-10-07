import type { Metadata } from "next"

import { AssociationSettingsForm } from "@/components/settings/settings-forms"

export const metadata: Metadata = { title: "إعدادات الجمعية" }

export default function AssociationSettingsPage() {
  return <AssociationSettingsForm />
}
