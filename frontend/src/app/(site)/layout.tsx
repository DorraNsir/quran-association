import type { Metadata } from "next"
import { Amiri } from "next/font/google"

import { SiteFooter, SiteHeader } from "@/components/website/site-chrome"
import { getSiteSettings } from "@/lib/api/public-site"
import { todayInTunis } from "@/lib/dates"

const amiri = Amiri({ variable: "--font-amiri", subsets: ["arabic", "latin"], weight: ["400", "700"] })

export const metadata: Metadata = {
  title: { default: "الفرع المحلي عمر بن الخطاب بدار شعبان الفهري", template: "%s · عمر بن الخطاب" },
  description: "جمعية قرآنية بدار شعبان الفهري: تحفيظ القرآن الكريم، التجويد، برامج للأطفال والشباب والكبار.",
}

/** Public website shell — its own header/footer and typography, distinct from the workspaces. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  // The site still renders (fallback identity) if the API is momentarily unreachable
  const settings = await getSiteSettings().catch(() => null)
  return (
    <div className={`${amiri.variable} flex min-h-svh flex-col bg-[#fbfaf6]`}>
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3">
        تخطي إلى المحتوى
      </a>
      <SiteHeader settings={settings} />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter settings={settings} year={todayInTunis().slice(0, 4)} />
    </div>
  )
}
