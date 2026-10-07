import type { Metadata } from "next"

import { GraduatesPage } from "@/components/website/pages"

export const metadata: Metadata = { title: "الخاتمون", description: "خاتمو كتاب الله من طلبة الجمعية." }

export default function GraduatesPageRoute() {
  return <GraduatesPage />
}
