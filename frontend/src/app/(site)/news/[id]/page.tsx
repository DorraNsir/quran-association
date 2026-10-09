import type { Metadata } from "next"

import { NewsArticlePage } from "@/components/website/pages"
import { getNewsArticle } from "@/lib/api/public-site"

export async function generateMetadata(props: PageProps<"/news/[id]">): Promise<Metadata> {
  const { id } = await props.params
  // Only published articles expose a title/description
  const article = await getNewsArticle(id).catch(() => null)
  return { title: article?.titleAr ?? "الأخبار", description: article?.excerptAr }
}

/** Published articles only (the public API hides drafts and future publication days). */
export default async function NewsArticleRoute(props: PageProps<"/news/[id]">) {
  const { id } = await props.params
  return <NewsArticlePage id={id} />
}
