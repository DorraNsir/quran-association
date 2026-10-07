import type { Metadata } from "next"

import { BackupsInfo } from "@/components/settings/settings-forms"

export const metadata: Metadata = { title: "النسخ الاحتياطي" }

export default function BackupsPage() {
  return <BackupsInfo />
}
