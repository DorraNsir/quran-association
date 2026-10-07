"use client"

import { ArrowRight, CalendarDays, Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { formatDate, formatPhone } from "@/lib/format"
import { branches, MOCK_TODAY, teachers } from "@/lib/mock"
import { allStudents, useOperations } from "@/lib/store/operations"
import {
  achievementYear,
  getActiveHeroSlides,
  getFeaturedAchievements,
  getPastPublicEvents,
  getPublicBranches,
  getPublicStatistics,
  getPublicUpcomingGroups,
  getPublishedAchievements,
  getPublishedAdministrationMembers,
  getPublishedGalleryImages,
  getPublishedGraduates,
  getPublishedNews,
  getPublishedOfferings,
  getPublishedPrograms,
  getUpcomingPublicEvents,
  lines,
  paragraphs,
} from "@/lib/website"
import type { ID } from "@/types/domain"

import {
  AchievementCard,
  CardGrid,
  Container,
  EventCard,
  GalleryGrid,
  GraduateCard,
  GroupListingCard,
  HeroCarousel,
  JoinBand,
  MemberCard,
  NewsCard,
  OfferingCard,
  PageHero,
  ProgramCard,
  PublicEmpty,
  Section,
  StatsBand,
} from "./blocks"
import { CmsImage } from "./cms-image"

/*
 * Public pages. They read ONLY through lib/website selectors (published /
 * active / public content) and aggregate counts — never personal data.
 */

const today = MOCK_TODAY
const publicBranches = getPublicBranches(branches)
const branchById = (id?: ID) => publicBranches.find((b) => b.id === id)

function useStats() {
  const state = useOperations()
  const s = getPublicStatistics({ students: allStudents(state), teachers, branches, graduates: state.quranGraduates })
  return [
    { label: "طالب وطالبة", value: s.students },
    { label: "معلم ومعلمة", value: s.teachers },
    { label: "فروع", value: s.branches },
    { label: "خاتم لكتاب الله", value: s.graduates },
  ]
}

export function HomePage() {
  const state = useOperations()
  const settings = state.siteSettings
  const slides = getActiveHeroSlides(state.heroSlides)
  const offerings = getPublishedOfferings(state.serviceOfferings).slice(0, 6)
  const programs = getPublishedPrograms(state.publicPrograms).slice(0, 3)
  const upcomingGroups = getPublicUpcomingGroups(state.publicGroups).slice(0, 3)
  const events = getUpcomingPublicEvents(state.publicEvents, today).slice(0, 3)
  const featured = getFeaturedAchievements(state.achievements)
  const graduates = getPublishedGraduates(state.quranGraduates).slice(0, 4)
  const news = getPublishedNews(state.newsArticles, today).slice(0, 3)
  const gallery = getPublishedGalleryImages(state.galleryImages).slice(0, 5)
  const stats = useStats()
  const aboutImage = getPublishedGalleryImages(state.galleryImages)[0]?.imageUrl ?? slides[0]?.imageUrl

  return (
    <>
      <HeroCarousel slides={slides} fallbackTitle="بيئة تربوية لحفظ كتاب الله وتعلّمه" fallbackSubtitle={settings.shortDescriptionAr} />

      <section aria-labelledby="about-title" className="py-14 sm:py-20">
        <Container className="grid items-center gap-10 lg:grid-cols-2">
          <div className="space-y-5">
            <p className="flex items-center gap-2 text-sm font-medium text-primary"><span aria-hidden className="h-px w-6 bg-current" />من نحن</p>
            <h2 id="about-title" className="font-display text-3xl leading-tight font-bold sm:text-4xl">{state.associationSettings.name}</h2>
            {paragraphs(settings.aboutAr).slice(0, 2).map((p) => (
              <p key={p} className="leading-relaxed text-muted-foreground">{p}</p>
            ))}
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/about">تعرف على الجمعية</Link>
            </Button>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem]">
            <CmsImage src={aboutImage} alt="من حياة الجمعية" />
          </div>
        </Container>
      </section>

      {offerings.length > 0 && (
        <Section id="offer" tone="soft" eyebrow="لماذا عمر بن الخطاب؟" title="ماذا نقدم لطلابنا؟">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offerings.map((o) => <OfferingCard key={o.id} offering={o} />)}
          </div>
        </Section>
      )}

      {programs.length > 0 && (
        <Section id="programs" eyebrow="برامجنا" title="برامج لكل الأعمار" link={{ href: "/programs", label: "كل البرامج" }}>
          <CardGrid count={programs.length}>
            {programs.map((p) => <ProgramCard key={p.id} program={p} />)}
          </CardGrid>
        </Section>
      )}

      <Section id="groups" tone="soft" eyebrow="التسجيل" title="مجموعات ستفتح قريباً" link={{ href: "/groups", label: "كل المجموعات" }}>
        {upcomingGroups.length === 0 ? (
          <PublicEmpty message="لا توجد مجموعات جديدة معلنة حالياً" />
        ) : (
          <CardGrid count={upcomingGroups.length}>
            {upcomingGroups.map((g) => <GroupListingCard key={g.id} listing={g} branch={branchById(g.branchId)} />)}
          </CardGrid>
        )}
      </Section>

      <Section id="events" eyebrow="أجندة الجمعية" title="الفعاليات القادمة" link={{ href: "/events", label: "عرض جميع الفعاليات" }}>
        {events.length === 0 ? (
          <PublicEmpty message="لا توجد فعاليات قادمة حالياً" />
        ) : (
          <CardGrid count={events.length}>
            {events.map((e) => <EventCard key={e.id} event={e} today={today} />)}
          </CardGrid>
        )}
      </Section>

      <StatsBand stats={stats} />

      {featured.length > 0 && (
        <Section id="achievements" tone="dark" eyebrow="مسيرة وعطاء" title="إنجازات الجمعية" link={{ href: "/achievements", label: "اكتشف إنجازاتنا" }}>
          <CardGrid count={featured.length} max={4}>
            {featured.map((a) => <AchievementCard key={a.id} achievement={a} dark />)}
          </CardGrid>
        </Section>
      )}

      {graduates.length > 0 && (
        <Section id="graduates" eyebrow="بارك الله فيهم" title="من خاتمي الجمعية" link={{ href: "/graduates", label: "عرض جميع الخاتمين" }}>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {graduates.map((g) => <GraduateCard key={g.id} graduate={g} />)}
          </div>
        </Section>
      )}

      <Section id="news" tone="soft" eyebrow="من الجمعية" title="آخر الأخبار" link={{ href: "/news", label: "عرض جميع الأخبار" }}>
        {news.length === 0 ? (
          <PublicEmpty message="لا توجد أخبار منشورة حالياً" />
        ) : (
          <CardGrid count={news.length}>
            {news.map((n) => <NewsCard key={n.id} article={n} />)}
          </CardGrid>
        )}
      </Section>

      {gallery.length > 0 && (
        <Section id="gallery" eyebrow="صور" title="من حياة الجمعية" link={{ href: "/gallery", label: "معرض الصور" }}>
          <GalleryGrid images={gallery} />
        </Section>
      )}

      <JoinBand enabled={settings.registrationEnabled} />
    </>
  )
}

export function AboutPage() {
  const state = useOperations()
  const s = state.siteSettings
  const members = getPublishedAdministrationMembers(state.administrationMembers)
  const stats = useStats()
  const blocks = [
    { title: "رسالتنا", text: s.missionAr },
    { title: "رؤيتنا", text: s.visionAr },
  ]

  return (
    <>
      <PageHero eyebrow="عن الجمعية" title="من نحن" intro={s.shortDescriptionAr} />
      <Section title={state.associationSettings.name}>
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4 text-lg leading-loose text-foreground/85">
            {paragraphs(s.aboutAr).map((p) => <p key={p}>{p}</p>)}
          </div>
          {s.historyAr && (
            <aside className="rounded-3xl bg-[#f4f1e8] p-6">
              <h3 className="mb-3 font-display text-2xl font-bold">تاريخ الجمعية</h3>
              <div className="space-y-3 leading-relaxed text-muted-foreground">
                {paragraphs(s.historyAr).map((p) => <p key={p}>{p}</p>)}
              </div>
            </aside>
          )}
        </div>
      </Section>
      <section className="pb-14 sm:pb-20">
        <Container className="grid gap-6 md:grid-cols-3">
          {blocks.map((b) => (
            <div key={b.title} className="rounded-3xl bg-white p-6 ring-1 ring-black/5">
              <h3 className="mb-2 font-display text-2xl font-bold text-primary">{b.title}</h3>
              <p className="leading-relaxed text-muted-foreground">{b.text}</p>
            </div>
          ))}
          {lines(s.valuesAr).length > 0 && (
            <div className="rounded-3xl bg-[#1f2421] p-6 text-white">
              <h3 className="mb-3 font-display text-2xl font-bold text-[#7fd09b]">قيمنا</h3>
              <ul className="space-y-2 text-white/80">
                {lines(s.valuesAr).map((v) => (
                  <li key={v} className="flex gap-2"><span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#d8b45a]" />{v}</li>
                ))}
              </ul>
            </div>
          )}
        </Container>
      </section>
      <StatsBand stats={stats} />
      <Section id="branches" eyebrow="أين نحن؟" title="فروعنا">
        <div className="grid gap-4 md:grid-cols-3">
          {publicBranches.map((b) => (
            <div key={b.id} className="space-y-2 rounded-3xl bg-white p-6 ring-1 ring-black/5">
              <h3 className="font-semibold">{b.name}</h3>
              <p className="flex gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{b.address}</p>
              {b.phone && <p className="flex gap-2 text-sm text-muted-foreground"><Phone className="mt-0.5 size-4 shrink-0" aria-hidden /><a href={`tel:${b.phone}`} dir="ltr">{b.phone}</a></p>}
            </div>
          ))}
        </div>
      </Section>
      {members.length > 0 && (
        <Section id="board" tone="soft" eyebrow="الهيئة المديرة" title="أعضاء إدارة الجمعية">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => <MemberCard key={m.id} member={m} />)}
          </div>
        </Section>
      )}
      <JoinBand enabled={s.registrationEnabled} />
    </>
  )
}

export function ProgramsPage() {
  const state = useOperations()
  const programs = getPublishedPrograms(state.publicPrograms)
  const offerings = getPublishedOfferings(state.serviceOfferings)
  return (
    <>
      <PageHero eyebrow="برامجنا" title="ما نقدّمه في الجمعية" intro="برامج متنوّعة تناسب كل الأعمار والمستويات، من الحفظ الأول إلى الإتقان." />
      <Section title="برامجنا">
        {programs.length === 0 ? <PublicEmpty message="لا توجد برامج منشورة حالياً" /> : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((p) => <ProgramCard key={p.id} program={p} />)}
          </div>
        )}
      </Section>
      {offerings.length > 0 && (
        <Section tone="soft" title="ماذا نقدم لطلابنا؟">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offerings.map((o) => <OfferingCard key={o.id} offering={o} />)}
          </div>
        </Section>
      )}
      <JoinBand enabled={state.siteSettings.registrationEnabled} />
    </>
  )
}

export function GroupsPage() {
  const state = useOperations()
  const groups = getPublicUpcomingGroups(state.publicGroups)
  return (
    <>
      <PageHero eyebrow="المجموعات" title="مجموعات ستفتح قريباً" intro="حلقات وبرامج جديدة تستعدّ الجمعية لإطلاقها — سجّل اهتمامك وسنتواصل معك." />
      <Section title="المجموعات المعلنة">
        {groups.length === 0 ? <PublicEmpty message="لا توجد مجموعات جديدة معلنة حالياً" /> : (
          <CardGrid count={groups.length}>
            {groups.map((g) => <GroupListingCard key={g.id} listing={g} branch={branchById(g.branchId)} />)}
          </CardGrid>
        )}
      </Section>
    </>
  )
}

export function EventsPage() {
  const state = useOperations()
  const upcoming = getUpcomingPublicEvents(state.publicEvents, today)
  const past = getPastPublicEvents(state.publicEvents, today)
  return (
    <>
      <PageHero eyebrow="الفعاليات" title="أجندة الجمعية" intro="مسابقات، حفلات تكريم وأمسيات قرآنية مفتوحة للعائلات." />
      <Section title="الفعاليات القادمة">
        {upcoming.length === 0 ? <PublicEmpty message="لا توجد فعاليات قادمة حالياً" /> : (
          <CardGrid count={upcoming.length}>
            {upcoming.map((e) => <EventCard key={e.id} event={e} today={today} />)}
          </CardGrid>
        )}
      </Section>
      {past.length > 0 && (
        <Section tone="soft" title="فعاليات سابقة">
          <CardGrid count={past.length}>
            {past.map((e) => <EventCard key={e.id} event={e} today={today} />)}
          </CardGrid>
        </Section>
      )}
    </>
  )
}

/** Achievements grouped by year — a simple timeline. */
export function AchievementsPage() {
  const state = useOperations()
  const items = getPublishedAchievements(state.achievements)
  const years = [...new Set(items.map(achievementYear))]
  return (
    <>
      <PageHero eyebrow="مسيرة وعطاء" title="إنجازات الجمعية" intro="محطات نعتزّ بها في خدمة كتاب الله ومجتمعنا." />
      <Section title="محطات الجمعية">
        {items.length === 0 ? <PublicEmpty message="لا توجد إنجازات منشورة حالياً" /> : (
          <ol className="space-y-12">
            {years.map((year) => (
              <li key={year} className="grid gap-6 md:grid-cols-[8rem_1fr]">
                <div className="md:sticky md:top-24 md:self-start">
                  <p className="font-display text-4xl font-bold text-primary tabular-nums">{year || "—"}</p>
                </div>
                <div className="grid gap-6 border-s-2 border-primary/20 ps-6 sm:grid-cols-2">
                  {items.filter((a) => achievementYear(a) === year).map((a) => <AchievementCard key={a.id} achievement={a} />)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  )
}

export function NewsPage() {
  const state = useOperations()
  const news = getPublishedNews(state.newsArticles, today)
  return (
    <>
      <PageHero eyebrow="الأخبار" title="أخبار الجمعية" />
      <Section title="آخر الأخبار">
        {news.length === 0 ? <PublicEmpty message="لا توجد أخبار منشورة حالياً" /> : (
          <CardGrid count={news.length}>
            {news.map((n) => <NewsCard key={n.id} article={n} />)}
          </CardGrid>
        )}
      </Section>
    </>
  )
}

/** One article — only when published (an unpublished id behaves like a missing page). */
export function NewsArticlePage({ id }: { id: ID }) {
  const state = useOperations()
  const article = getPublishedNews(state.newsArticles, today).find((n) => n.id === id)
  if (!article) {
    return (
      <Container className="py-24 text-center">
        <h1 className="font-display text-3xl font-bold">الخبر غير متوفر</h1>
        <p className="mt-2 text-muted-foreground">ربما لم يُنشر بعد أو تمّ حذفه.</p>
        <Button asChild variant="outline" className="mt-6 rounded-full"><Link href="/news">العودة إلى الأخبار</Link></Button>
      </Container>
    )
  }
  return (
    <article className="pb-16">
      <Container className="max-w-3xl pt-10">
        <Link href="/news" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
          الأخبار
        </Link>
        <time dateTime={article.publishedAt} className="mt-6 block text-sm text-muted-foreground">{formatDate(article.publishedAt)}</time>
        <h1 className="mt-2 font-display text-3xl leading-tight font-bold sm:text-5xl">{article.titleAr}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{article.excerptAr}</p>
      </Container>
      {article.coverImageUrl && (
        <Container className="mt-8 max-w-4xl">
          <div className="relative aspect-[16/9] overflow-hidden rounded-[2rem]">
            <CmsImage src={article.coverImageUrl} alt={article.titleAr} sizes="(min-width: 1024px) 896px, 100vw" priority />
          </div>
        </Container>
      )}
      <Container className="mt-8 max-w-3xl space-y-5 text-lg leading-loose text-foreground/85">
        {paragraphs(article.contentAr).map((p) => <p key={p}>{p}</p>)}
      </Container>
    </article>
  )
}

export function GraduatesPage() {
  const state = useOperations()
  const graduates = getPublishedGraduates(state.quranGraduates)
  return (
    <>
      <PageHero eyebrow="بارك الله فيهم" title="الخاتمون" intro="نعتزّ بطلبتنا الذين أتمّوا حفظ كتاب الله، ونسأل الله أن يجعله حجّة لهم." />
      <Section title="خاتمو كتاب الله">
        {graduates.length === 0 ? <PublicEmpty message="لا توجد أسماء منشورة حالياً" /> : (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {graduates.map((g) => <GraduateCard key={g.id} graduate={g} />)}
          </div>
        )}
      </Section>
    </>
  )
}

export function GalleryPage() {
  const state = useOperations()
  const images = getPublishedGalleryImages(state.galleryImages)
  return (
    <>
      <PageHero eyebrow="صور" title="معرض الصور" intro="لقطات من الحلقات والأنشطة وحفلات التكريم." />
      <Section title="من حياة الجمعية">
        {images.length === 0 ? <PublicEmpty message="لا توجد صور منشورة حالياً" /> : <GalleryGrid images={images} />}
      </Section>
    </>
  )
}

export function ContactPage() {
  const { siteSettings: s, associationSettings: a } = useOperations()
  const items = [
    a.phone && { icon: Phone, label: "الهاتف", value: <a href={`tel:${a.phone}`} dir="ltr" className="hover:underline">{formatPhone(a.phone)}</a> },
    a.email && { icon: Mail, label: "البريد الإلكتروني", value: <a href={`mailto:${a.email}`} dir="ltr" className="hover:underline">{a.email}</a> },
    a.address && { icon: MapPin, label: "العنوان", value: a.address },
    s.openingHoursAr && { icon: Clock, label: "أوقات الاستقبال", value: s.openingHoursAr },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: React.ReactNode }[]

  return (
    <>
      <PageHero eyebrow="تواصل معنا" title="نسعد بتواصلكم" intro="للاستفسار عن التسجيل أو البرامج، اتصلوا بنا أو زوروا أحد فروعنا." />
      <Section title={a.name}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <ul className="space-y-3">
            {items.map(({ icon: Icon, label, value }) => (
              <li key={label} className="flex gap-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary"><Icon className="size-5" aria-hidden /></span>
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="font-medium">{value}</p>
                </div>
              </li>
            ))}
            {s.mapUrl && (
              <li>
                <Button asChild variant="outline" className="w-full rounded-full">
                  <a href={s.mapUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />عرض الموقع على الخريطة</a>
                </Button>
              </li>
            )}
          </ul>
          <div className="space-y-4">
            <h3 className="font-display text-2xl font-bold">فروعنا</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {publicBranches.map((b) => (
                <div key={b.id} className="space-y-2 rounded-2xl bg-[#f4f1e8] p-5">
                  <p className="font-semibold">{b.name}</p>
                  <p className="flex gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{b.address}</p>
                  {b.phone && <p className="flex gap-2 text-sm text-muted-foreground"><Phone className="mt-0.5 size-4 shrink-0" aria-hidden /><a href={`tel:${b.phone}`} dir="ltr">{b.phone}</a></p>}
                </div>
              ))}
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              للتسجيل يمكنكم أيضًا <Link href="/registration" className="font-medium text-primary hover:underline">تقديم طلب عبر الموقع</Link>.
            </p>
          </div>
        </div>
      </Section>
    </>
  )
}
