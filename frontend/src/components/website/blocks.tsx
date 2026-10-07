"use client"

import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Trophy, X } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { achievementYear, publicEventStatus } from "@/lib/website"
import type {
  Achievement,
  AdministrationMember,
  Branch,
  GalleryImage,
  HeroSlide,
  ISODate,
  NewsArticle,
  PublicEvent,
  PublicGroupListing,
  PublicProgram,
  QuranGraduate,
  ServiceOffering,
} from "@/types/domain"

import { CmsImage } from "./cms-image"
import { WebsiteIcon } from "./icons"

/* ---------------- Layout ---------------- */

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>
}

/** Section with eyebrow + display title and an optional "see all" link. */
export function Section({
  id,
  eyebrow,
  title,
  intro,
  link,
  tone = "plain",
  children,
}: {
  id?: string
  eyebrow?: string
  title: string
  intro?: string
  link?: { href: string; label: string }
  tone?: "plain" | "soft" | "dark"
  children: React.ReactNode
}) {
  const dark = tone === "dark"
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn("py-14 sm:py-20", tone === "soft" && "bg-[#f4f1e8]", dark && "bg-[#1f2421] text-white")}
    >
      <Container>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
          <div className="max-w-2xl space-y-2">
            {eyebrow && (
              <p className={cn("flex items-center gap-2 text-sm font-medium", dark ? "text-[#7fd09b]" : "text-primary")}>
                <span aria-hidden className="h-px w-6 bg-current" />
                {eyebrow}
              </p>
            )}
            <h2 id={id ? `${id}-title` : undefined} className="font-display text-3xl leading-tight font-bold sm:text-4xl">
              {title}
            </h2>
            {intro && <p className={cn("leading-relaxed", dark ? "text-white/70" : "text-muted-foreground")}>{intro}</p>}
          </div>
          {link && (
            <Link href={link.href} className={cn("inline-flex items-center gap-1.5 text-sm font-medium hover:underline", dark ? "text-[#7fd09b]" : "text-primary")}>
              {link.label}
              <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
            </Link>
          )}
        </div>
        {children}
      </Container>
    </section>
  )
}

/**
 * Card grid that never leaves an empty column: with fewer items than the
 * maximum, the columns shrink to the item count (centred on wide screens).
 */
export function CardGrid({ count, max = 3, className, children }: { count: number; max?: 2 | 3 | 4; className?: string; children: React.ReactNode }) {
  const cols = Math.min(Math.max(count, 1), max)
  const lg = { 1: "lg:grid-cols-1 lg:max-w-md", 2: "lg:grid-cols-2 lg:max-w-4xl", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }[cols]
  return <div className={cn("mx-auto grid gap-6", cols > 1 && "sm:grid-cols-2", lg, className)}>{children}</div>
}

/** Inner page title band (all pages but the home). */
export function PageHero({ eyebrow, title, intro }: { eyebrow?: string; title: string; intro?: string }) {
  return (
    <div className="relative overflow-hidden bg-[#f4f1e8]">
      <div aria-hidden className="absolute -start-24 -top-24 size-72 rounded-full bg-primary/10" />
      <div aria-hidden className="absolute -end-16 bottom-0 size-48 rounded-full bg-primary/5" />
      <Container className="relative py-12 sm:py-16">
        {eyebrow && <p className="mb-2 text-sm font-medium text-primary">{eyebrow}</p>}
        <h1 className="font-display text-4xl font-bold sm:text-5xl">{title}</h1>
        {intro && <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{intro}</p>}
      </Container>
    </div>
  )
}

export function PublicEmpty({ message }: { message: string }) {
  return <p className="rounded-2xl border border-dashed bg-white/60 px-6 py-12 text-center text-muted-foreground">{message}</p>
}

/* ---------------- Hero ---------------- */

/** Admin-managed hero: one slide, or a small carousel with manual controls (no autoplay). */
export function HeroCarousel({ slides, fallbackTitle, fallbackSubtitle }: { slides: HeroSlide[]; fallbackTitle: string; fallbackSubtitle: string }) {
  const [index, setIndex] = useState(0)
  const current = slides[Math.min(index, slides.length - 1)]
  const go = (step: number) => setIndex((i) => (i + step + slides.length) % slides.length)

  return (
    <section aria-roledescription="carousel" aria-label="الواجهة" className="relative isolate overflow-hidden bg-[#1f2421]">
      <div className="relative h-[34rem] sm:h-[38rem]">
        {slides.map((slide, i) => (
          <div key={slide.id} aria-hidden={i !== index} className={cn("absolute inset-0 transition-opacity duration-700", i === index ? "opacity-100" : "opacity-0")}>
            <CmsImage src={slide.imageUrl} alt={slide.titleAr ?? ""} sizes="100vw" priority={i === 0} />
          </div>
        ))}
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-black/85 via-black/55 to-black/20 sm:bg-linear-to-l sm:from-black/70 sm:via-black/40 sm:to-transparent ltr:sm:bg-linear-to-r" />
        <Container className="relative flex h-full flex-col justify-end pb-16 sm:justify-center sm:pb-0">
          <div className="max-w-xl space-y-5 text-white" aria-live="polite">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm backdrop-blur">
              الفرع المحلي عمر بن الخطاب · بدار شعبان الفهري
            </p>
            <h1 className="font-display text-4xl leading-tight font-bold sm:text-6xl">{current?.titleAr ?? fallbackTitle}</h1>
            <p className="text-lg leading-relaxed text-white/85">{current?.subtitleAr ?? fallbackSubtitle}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
                <Link href={current?.ctaHref || "/registration"}>{current?.ctaLabelAr || "سجل الآن"}</Link>
              </Button>
              {current?.ctaHref !== "/programs" && (
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/40 bg-white/10 px-7 text-base text-white hover:bg-white/20 hover:text-white">
                  <Link href="/programs">اكتشف برامجنا</Link>
                </Button>
              )}
            </div>
          </div>
        </Container>
        {slides.length > 1 && (
          <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-3">
            <button type="button" onClick={() => go(-1)} aria-label="الشريحة السابقة" className="flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25">
              <ChevronRight className="size-5 ltr:rotate-180" />
            </button>
            {slides.map((s, i) => (
              <button key={s.id} type="button" onClick={() => setIndex(i)} aria-label={`الشريحة ${i + 1}`} aria-current={i === index}
                className={cn("h-2 rounded-full transition-all", i === index ? "w-6 bg-white" : "w-2 bg-white/50")} />
            ))}
            <button type="button" onClick={() => go(1)} aria-label="الشريحة التالية" className="flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25">
              <ChevronLeft className="size-5 ltr:rotate-180" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------------- Cards ---------------- */

export function OfferingCard({ offering }: { offering: ServiceOffering }) {
  return (
    <div className="flex gap-4 rounded-2xl bg-white p-5 ring-1 ring-black/5 transition-shadow hover:shadow-md">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
        <WebsiteIcon name={offering.icon} className="size-6" />
      </span>
      <div className="space-y-1">
        <h3 className="font-semibold">{offering.titleAr}</h3>
        {offering.descriptionAr && <p className="text-sm leading-relaxed text-muted-foreground">{offering.descriptionAr}</p>}
      </div>
    </div>
  )
}

export function ProgramCard({ program }: { program: PublicProgram }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-black/5 transition-shadow hover:shadow-lg">
      <div className="relative aspect-[3/2] overflow-hidden">
        <CmsImage src={program.imageUrl} alt={program.titleAr} className="transition-transform duration-500 group-hover:scale-[1.03]" />
        <span className="absolute start-4 top-4 flex size-11 items-center justify-center rounded-xl bg-white/95 text-primary shadow-sm">
          <WebsiteIcon name={program.icon} className="size-5" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display text-xl font-bold">{program.titleAr}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{program.descriptionAr}</p>
      </div>
    </article>
  )
}

export function GroupListingCard({ listing, branch }: { listing: PublicGroupListing; branch?: Pick<Branch, "name"> }) {
  const status = listing.publicStatus === "OPEN" ? "التسجيل مفتوح" : "يفتح قريباً"
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-black/5">
      <div className="relative aspect-[16/9]">
        <CmsImage src={listing.imageUrl} alt={listing.titleAr} />
        <span className={cn("absolute start-4 top-4 rounded-full px-3 py-1 text-xs font-medium", listing.publicStatus === "OPEN" ? "bg-primary text-primary-foreground" : "bg-white text-foreground")}>
          {status}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="font-display text-xl font-bold">{listing.titleAr}</h3>
          <p className="text-sm text-primary">{listing.audienceAr}</p>
        </div>
        {listing.descriptionAr && <p className="text-sm leading-relaxed text-muted-foreground">{listing.descriptionAr}</p>}
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {branch && <li className="flex items-center gap-2"><MapPin className="size-4 shrink-0" aria-hidden />{branch.name}</li>}
          {listing.startDate && <li className="flex items-center gap-2"><CalendarDays className="size-4 shrink-0" aria-hidden />يبدأ في {formatDate(listing.startDate)}</li>}
          {listing.scheduleAr && <li className="flex items-center gap-2"><Clock className="size-4 shrink-0" aria-hidden />{listing.scheduleAr}</li>}
        </ul>
        <div className="mt-auto pt-2">
          {listing.registrationOpen ? (
            <Button asChild className="w-full rounded-full">
              <Link href={`/registration?interest=${listing.id}`}>سجل الآن</Link>
            </Button>
          ) : (
            <p className="rounded-full bg-muted py-2 text-center text-sm text-muted-foreground">التسجيل سيفتح لاحقاً</p>
          )}
        </div>
      </div>
    </article>
  )
}

function DateBadge({ date }: { date: ISODate }) {
  const d = new Date(`${date}T00:00:00Z`)
  return (
    <span className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-white py-1.5 text-center shadow-sm">
      <span className="text-xl leading-none font-bold tabular-nums">{d.getUTCDate()}</span>
      <span className="text-[0.7rem] text-muted-foreground">{new Intl.DateTimeFormat("ar-TN", { month: "short", timeZone: "UTC" }).format(d)}</span>
    </span>
  )
}

export function EventCard({ event, today }: { event: PublicEvent; today: ISODate }) {
  const status = publicEventStatus(event, today)
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-black/5">
      <div className="relative aspect-[16/10]">
        <CmsImage src={event.imageUrl} alt={event.titleAr} className={cn(status === "CANCELLED" && "grayscale")} />
        <div className="absolute start-4 top-4"><DateBadge date={event.startDate} /></div>
        {status !== "UPCOMING" && (
          <span className={cn("absolute end-4 top-4 rounded-full px-3 py-1 text-xs font-medium", status === "CANCELLED" ? "bg-destructive text-white" : "bg-black/60 text-white")}>
            {status === "CANCELLED" ? "أُلغيت" : "انتهت"}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display text-xl font-bold">{event.titleAr}</h3>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <li className="flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />{formatDate(event.startDate)}{event.endDate && ` — ${formatDate(event.endDate)}`}</li>
          {event.time && <li className="flex items-center gap-1.5"><Clock className="size-4" aria-hidden /><span dir="ltr">{event.time}</span></li>}
          {event.location && <li className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{event.location}</li>}
        </ul>
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{event.descriptionAr}</p>
      </div>
    </article>
  )
}

export function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <article className="group h-full">
      <Link href={`/news/${article.id}`} className="flex h-full flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-black/5 outline-none transition-shadow hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50">
        <div className="relative aspect-[16/10] overflow-hidden">
          <CmsImage src={article.coverImageUrl} alt={article.titleAr} className="transition-transform duration-500 group-hover:scale-[1.03]" />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-5">
          <time dateTime={article.publishedAt} className="text-xs text-primary">{formatDate(article.publishedAt)}</time>
          <h3 className="font-display text-xl leading-snug font-bold">{article.titleAr}</h3>
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{article.excerptAr}</p>
          <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-primary">
            اقرأ المزيد
            <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
          </span>
        </div>
      </Link>
    </article>
  )
}

export function AchievementCard({ achievement, dark }: { achievement: Achievement; dark?: boolean }) {
  const year = achievementYear(achievement)
  return (
    <article className={cn("flex h-full flex-col overflow-hidden rounded-3xl", dark ? "bg-white/5 ring-1 ring-white/10" : "bg-white ring-1 ring-black/5")}>
      <div className="relative aspect-[16/10]">
        <CmsImage src={achievement.imageUrl} alt={achievement.titleAr} />
        {year > 0 && <span className="absolute start-4 top-4 rounded-full bg-[#d8b45a] px-3 py-1 text-sm font-semibold text-[#1f2421] tabular-nums">{year}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="flex items-start gap-2 font-display text-xl leading-snug font-bold">
          <Trophy className={cn("mt-1 size-5 shrink-0", dark ? "text-[#d8b45a]" : "text-primary")} aria-hidden />
          {achievement.titleAr}
        </h3>
        <p className={cn("text-sm leading-relaxed", dark ? "text-white/70" : "text-muted-foreground")}>{achievement.descriptionAr}</p>
      </div>
    </article>
  )
}

export function GraduateCard({ graduate }: { graduate: QuranGraduate }) {
  return (
    <article className="flex h-full flex-col items-center gap-3 rounded-3xl bg-white p-6 text-center ring-1 ring-black/5">
      <div className="rounded-full bg-linear-to-br from-[#d8b45a] to-primary p-1">
        <div className="rounded-full bg-white p-1">
          <UserAvatar name={graduate.fullName} photoUrl={graduate.photoUrl} size="xl" />
        </div>
      </div>
      <div className="space-y-1">
        <h3 className="font-display text-lg font-bold">{graduate.fullName}</h3>
        {(graduate.completionYear || graduate.completionDate) && (
          <p className="text-sm text-primary">ختم القرآن الكريم · {graduate.completionDate ? formatDate(graduate.completionDate) : graduate.completionYear}</p>
        )}
        {graduate.shortMessage && <p className="text-sm leading-relaxed text-muted-foreground">{graduate.shortMessage}</p>}
      </div>
    </article>
  )
}

export function MemberCard({ member }: { member: AdministrationMember }) {
  return (
    <article className="flex h-full gap-4 rounded-3xl bg-white p-5 ring-1 ring-black/5">
      <UserAvatar name={member.fullName} photoUrl={member.photoUrl} size="lg" />
      <div className="min-w-0 space-y-1">
        <h3 className="font-semibold">{member.fullName}</h3>
        <p className="text-sm font-medium text-primary">{member.roleAr}</p>
        {member.shortBioAr && <p className="text-sm leading-relaxed text-muted-foreground">{member.shortBioAr}</p>}
      </div>
    </article>
  )
}

/* ---------------- Statistics & gallery ---------------- */

export function StatsBand({ stats }: { stats: { label: string; value: number }[] }) {
  return (
    <section aria-label="الجمعية بالأرقام" className="bg-primary text-primary-foreground">
      <Container className="grid grid-cols-2 gap-6 py-12 text-center sm:py-14 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="font-display text-4xl font-bold tabular-nums sm:text-5xl">{s.value}</p>
            <p className="mt-1 text-sm text-primary-foreground/80">{s.label}</p>
          </div>
        ))}
      </Container>
    </section>
  )
}

/** Image grid with an accessible enlarged view. */
export function GalleryGrid({ images }: { images: GalleryImage[] }) {
  const [open, setOpen] = useState<GalleryImage | null>(null)
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {images.map((image, i) => (
          <li key={image.id} className={cn(i === 0 && "col-span-2 row-span-2 md:col-span-2")}>
            <button
              type="button"
              onClick={() => setOpen(image)}
              className="group relative block aspect-square w-full overflow-hidden rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`عرض الصورة: ${image.titleAr ?? ""}`}
            >
              <CmsImage src={image.imageUrl} alt={image.titleAr ?? ""} className="transition-transform duration-500 group-hover:scale-105" />
              {image.titleAr && (
                <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-3 pt-8 text-start text-sm font-medium text-white">
                  {image.titleAr}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent showCloseButton={false} className="max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">{open?.titleAr ?? "صورة"}</DialogTitle>
          <DialogDescription className="sr-only">{open?.descriptionAr ?? "صورة من معرض الجمعية"}</DialogDescription>
          <div className="relative aspect-[3/2] bg-black">
            {open && <CmsImage src={open.imageUrl} alt={open.titleAr ?? ""} sizes="90vw" className="object-contain" />}
          </div>
          {(open?.titleAr || open?.descriptionAr) && (
            <div className="space-y-1 p-4">
              <p className="font-semibold">{open?.titleAr}</p>
              {open?.descriptionAr && <p className="text-sm text-muted-foreground">{open.descriptionAr}</p>}
            </div>
          )}
          <Button variant="secondary" size="icon" className="absolute end-3 top-3 rounded-full" aria-label="إغلاق" onClick={() => setOpen(null)}>
            <X />
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Closing registration call-to-action. */
export function JoinBand({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-[#1f2421] px-6 py-12 text-center text-white sm:px-12 sm:py-16">
          <div aria-hidden className="absolute -end-20 -top-20 size-64 rounded-full bg-primary/40 blur-2xl" />
          <div aria-hidden className="absolute -bottom-24 -start-16 size-64 rounded-full bg-[#d8b45a]/20 blur-2xl" />
          <div className="relative mx-auto max-w-2xl space-y-5">
            <h2 className="font-display text-3xl leading-tight font-bold sm:text-4xl">انضمّ إلى حلقات القرآن الكريم</h2>
            <p className="leading-relaxed text-white/75">قدّم طلب التسجيل في دقائق، وسيتواصل معك فريق الجمعية لاختيار الحلقة المناسبة.</p>
            <Button asChild size="lg" className="h-12 rounded-full px-8 text-base">
              <Link href="/registration">سجل الآن</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}
