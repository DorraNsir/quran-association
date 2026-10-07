import type { Metadata } from "next"

import { ProgramsPage } from "@/components/website/pages"

export const metadata: Metadata = { title: "برامجنا", description: "حفظ القرآن، التجويد، برامج الأطفال والشباب والكبار والبرامج الصيفية." }

export default function ProgramsPageRoute() {
  return <ProgramsPage />
}
