import type { Metadata } from "next"

import { HomePage } from "@/components/website/pages"

export const metadata: Metadata = {
  title: { absolute: "الفرع المحلي عمر بن الخطاب بدار شعبان الفهري — حفظ القرآن الكريم" },
  description: "بيئة تربوية لحفظ كتاب الله وتعلّمه بدار شعبان الفهري: أقسام للأطفال والشباب والكبار، تجويد، فعاليات وتسجيل عبر الموقع.",
}

export default function Home() {
  return <HomePage />
}
