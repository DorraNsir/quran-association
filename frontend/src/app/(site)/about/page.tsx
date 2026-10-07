import type { Metadata } from "next"

import { AboutPage } from "@/components/website/pages"

export const metadata: Metadata = { title: "عن الجمعية", description: "تعرّف على الفرع المحلي عمر بن الخطاب: رسالتنا، رؤيتنا، فروعنا وأعضاء الإدارة." }

export default function AboutPageRoute() {
  return <AboutPage />
}
