import type { Metadata } from "next"

import { NewsArticlePage } from "@/components/website/pages"
import { MOCK_TODAY, newsArticles } from "@/lib/mock"
import { getPublishedNews } from "@/lib/website"

export async function generateMetadata(props: PageProps<"/news/[id]">): Promise<Metadata> {
  const { id } = await props.params
  // Only published articles expose a title/description
  const article = getPublishedNews(newsArticles, MOCK_TODAY).find((n) => n.id === id)
  return { title: article?.titleAr ?? "الأخبار", description: article?.excerptAr }
}

/** Resolved from the shared store (articles published in this session included). */
export default async function NewsArticleRoute(props: PageProps<"/news/[id]">) {
  const { id } = await props.params
  return <NewsArticlePage id={id} />
}
