import type { Metadata } from "next"

import { GalleryPage } from "@/components/website/pages"

export const metadata: Metadata = { title: "معرض الصور", description: "صور من أقسام الجمعية وأنشطتها." }

export default function GalleryPageRoute() {
  return <GalleryPage />
}
