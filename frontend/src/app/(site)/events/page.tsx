import type { Metadata } from "next"

import { EventsPage } from "@/components/website/pages"

export const metadata: Metadata = { title: "الفعاليات", description: "الفعاليات القادمة والسابقة للجمعية: مسابقات، حفلات تكريم وأمسيات قرآنية." }

export default function EventsPageRoute() {
  return <EventsPage />
}
