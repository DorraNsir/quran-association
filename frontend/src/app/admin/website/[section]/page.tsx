import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CmsSection } from "@/components/cms/cms-sections"
import { CMS_SLUGS } from "@/components/cms/cms-slugs"

export const metadata: Metadata = { title: "الموقع الإلكتروني" }

/** home, offerings, programs, groups, events, news, gallery, graduates, administration, achievements */
export default async function WebsiteSectionPage(props: PageProps<"/admin/website/[section]">) {
  const { section } = await props.params
  if (!CMS_SLUGS.includes(section)) notFound()
  return <CmsSection slug={section} />
}
