import type { Metadata } from "next"
import { Amiri } from "next/font/google"

import { SiteFooter, SiteHeader } from "@/components/website/site-chrome"

const amiri = Amiri({ variable: "--font-amiri", subsets: ["arabic", "latin"], weight: ["400", "700"] })

export const metadata: Metadata = {
  title: { default: "الفرع المحلي عمر بن الخطاب بدار شعبان الفهري", template: "%s · عمر بن الخطاب" },
  description: "جمعية قرآنية بدار شعبان الفهري: تحفيظ القرآن الكريم، التجويد، برامج للأطفال والشباب والكبار.",
}

/** Public website shell — its own header/footer and typography, distinct from the workspaces. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`${amiri.variable} flex min-h-svh flex-col bg-[#fbfaf6]`}>
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3">
        تخطي إلى المحتوى
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
