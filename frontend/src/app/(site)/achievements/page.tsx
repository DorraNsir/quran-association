import type { Metadata } from "next"

import { AchievementsPage } from "@/components/website/pages"

export const metadata: Metadata = { title: "إنجازات الجمعية", description: "محطات وإنجازات الجمعية في خدمة كتاب الله." }

export default function AchievementsPageRoute() {
  return <AchievementsPage />
}
