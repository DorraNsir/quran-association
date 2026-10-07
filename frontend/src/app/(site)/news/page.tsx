import type { Metadata } from "next"

import { NewsPage } from "@/components/website/pages"

export const metadata: Metadata = { title: "الأخبار", description: "آخر أخبار الفرع المحلي عمر بن الخطاب." }

export default function NewsPageRoute() {
  return <NewsPage />
}
