"use client"

import { Camera, Globe, LogIn, Mail, MapPin, Menu, Phone, PlayCircle } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { AssociationLogo } from "@/components/layout/brand"
import { Button } from "@/components/ui/button"
import { useDirection } from "@/components/ui/direction"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatPhone } from "@/lib/format"
import { MOCK_TODAY } from "@/lib/mock/reference-date"
import { useOperations } from "@/lib/store/operations"
import { cn } from "@/lib/utils"


export const SITE_NAV = [
  { href: "/", label: "الرئيسية" },
  { href: "/about", label: "عن الجمعية" },
  { href: "/programs", label: "برامجنا" },
  { href: "/groups", label: "المجموعات" },
  { href: "/events", label: "الفعاليات" },
  { href: "/achievements", label: "الإنجازات" },
  { href: "/news", label: "الأخبار" },
  { href: "/graduates", label: "الخاتمون" },
  { href: "/contact", label: "تواصل معنا" },
]

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`))

function SiteBrand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <AssociationLogo className="h-11 w-auto max-w-14 shrink-0" />
      <span className={cn("flex min-w-0 flex-col leading-tight", compact && "max-sm:hidden")}>
        <span className="truncate font-display text-base font-bold">عمر بن الخطاب</span>
        <span className="truncate text-xs text-muted-foreground">بدار شعبان الفهري</span>
      </span>
    </Link>
  )
}

/** Public header: full navigation on large screens, a sheet on smaller ones; "سجل الآن" always visible. */
export function SiteHeader() {
  const pathname = usePathname()
  const dir = useDirection()
  const [open, setOpen] = useState(false)
  const { siteSettings } = useOperations()

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur supports-backdrop-filter:bg-white/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        <SiteBrand compact />
        <nav aria-label="القائمة الرئيسية" className="ms-4 hidden flex-1 items-center gap-0.5 xl:flex">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href, pathname) ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive(item.href, pathname) ? "bg-brand-soft font-medium text-brand-soft-foreground" : "text-foreground/75 hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1.5 xl:ms-0">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">
              <LogIn />
              تسجيل الدخول
            </Link>
          </Button>
          {siteSettings.registrationEnabled && (
            <Button asChild size="sm" className="rounded-full px-4">
              <Link href="/registration">سجل الآن</Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="xl:hidden" aria-label="فتح القائمة" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={dir === "rtl" ? "right" : "left"} className="gap-0 p-0 data-[side=left]:w-80 data-[side=right]:w-80">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="sr-only">القائمة</SheetTitle>
            <SheetDescription className="sr-only">صفحات موقع الجمعية</SheetDescription>
            <SiteBrand />
          </SheetHeader>
          <nav aria-label="القائمة الرئيسية" className="flex flex-col gap-1 overflow-y-auto p-3">
            {SITE_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(item.href, pathname) ? "page" : undefined}
                className={cn(
                  "rounded-xl px-4 py-3 text-base transition-colors",
                  isActive(item.href, pathname) ? "bg-brand-soft font-medium text-brand-soft-foreground" : "hover:bg-muted"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto grid gap-2 border-t p-4">
            {siteSettings.registrationEnabled && (
              <Button asChild size="lg" className="rounded-full" onClick={() => setOpen(false)}>
                <Link href="/registration">سجل الآن</Link>
              </Button>
            )}
            <Button asChild variant="outline" size="lg" className="rounded-full" onClick={() => setOpen(false)}>
              <Link href="/login">
                <LogIn />
                تسجيل الدخول
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}

/** Footer — identity from AssociationSettings, website content from SiteSettings. */
export function SiteFooter() {
  const { siteSettings: s, associationSettings: a } = useOperations()
  const socials = [
    { href: s.facebookUrl, icon: Globe, label: "فيسبوك" },
    { href: s.instagramUrl, icon: Camera, label: "إنستغرام" },
    { href: s.youtubeUrl, icon: PlayCircle, label: "يوتيوب" },
  ].filter((x) => x.href)

  return (
    <footer className="bg-[#1f2421] text-white/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white p-2">
              <AssociationLogo className="h-full w-auto" />
            </span>
            <p className="font-display text-xl font-bold text-white">{a.name}</p>
          </div>
          <p className="max-w-md text-sm leading-relaxed">{s.shortDescriptionAr}</p>
          {socials.length > 0 && (
            <ul className="flex gap-2">
              {socials.map(({ href, icon: Icon, label }) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                    className="flex size-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
                    <Icon className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <nav aria-label="روابط مفيدة">
          <p className="mb-3 font-semibold text-white">روابط مفيدة</p>
          <ul className="grid grid-cols-2 gap-2 text-sm md:grid-cols-1">
            {[...SITE_NAV.slice(1), { href: "/gallery", label: "معرض الصور" }, { href: "/registration", label: "التسجيل" }].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-white">{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-white">تواصل معنا</p>
          {a.address && <p className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{a.address}</p>}
          {a.phone && (
            <p className="flex gap-2">
              <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
              <a href={`tel:${a.phone}`} dir="ltr" className="hover:text-white">{formatPhone(a.phone)}</a>
            </p>
          )}
          {a.email && <p className="flex gap-2"><Mail className="mt-0.5 size-4 shrink-0" aria-hidden /><a href={`mailto:${a.email}`} dir="ltr" className="hover:text-white">{a.email}</a></p>}
          {s.registrationEnabled && (
            <Button asChild size="sm" className="mt-2 rounded-full">
              <Link href="/registration">سجل الآن</Link>
            </Button>
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-white/60 sm:px-6 lg:px-8">
          © {MOCK_TODAY.slice(0, 4)} {a.name}. جميع الحقوق محفوظة.
        </p>
      </div>
    </footer>
  )
}
