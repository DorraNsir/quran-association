import type { Metadata } from "next"

import { CmsDashboard } from "@/components/cms/cms-sections"

export const metadata: Metadata = { title: "الموقع الإلكتروني" }

export default function WebsiteCmsPage() {
  return <CmsDashboard />
}
