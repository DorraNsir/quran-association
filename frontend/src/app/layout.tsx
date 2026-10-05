import type { Metadata } from "next"
import { IBM_Plex_Sans_Arabic } from "next/font/google"

import { Providers } from "@/components/providers"
import { defaultLocale, locales } from "@/lib/i18n"

import "./globals.css"

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: {
    default: "الفرع المحلي عمر بن الخطاب",
    template: "%s · عمر بن الخطاب",
  },
  description:
    "منصة التسيير والمتابعة البيداغوجية — الفرع المحلي عمر بن الخطاب بدار شعبان الفهري",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const { dir } = locales[defaultLocale]

  return (
    <html
      lang={defaultLocale}
      dir={dir}
      className={`${plexArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers dir={dir}>{children}</Providers>
      </body>
    </html>
  )
}
