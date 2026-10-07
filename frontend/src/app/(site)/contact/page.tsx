import type { Metadata } from "next"

import { ContactPage } from "@/components/website/pages"

export const metadata: Metadata = { title: "تواصل معنا", description: "الهاتف، العنوان وفروع الجمعية." }

export default function ContactPageRoute() {
  return <ContactPage />
}
