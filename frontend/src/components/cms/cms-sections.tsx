"use client"

import {
  Award,
  BadgeInfo,
  CalendarDays,
  CalendarX2,
  FolderKanban,
  Globe,
  Home,
  Image as ImageIcon,
  Layers,
  Lock,
  Newspaper,
  Settings,
  Sparkles,
  Star,
  Trophy,
  Unlock,
  UsersRound,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { WEBSITE_ICONS } from "@/components/website/icons"
import { FormField, FormSection } from "@/components/shared/form"
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatDate } from "@/lib/format"
import { branches, groups } from "@/lib/mock"
import { MOCK_TODAY } from "@/lib/mock/reference-date"
import { operations, useOperations, type CmsCollection } from "@/lib/store/operations"
import { publicEventStatus } from "@/lib/website"
import type { AchievementCategory, GalleryCategory, SiteSettings } from "@/types/domain"

import { CmsManager, type CmsConfig, type CmsField } from "./cms-manager"

const ICON_OPTIONS = Object.entries(WEBSITE_ICONS).map(([value, { label }]) => ({ value, label }))
const GALLERY_CATEGORIES: Record<GalleryCategory, string> = {
  ACTIVITIES: "أنشطة",
  CEREMONIES: "حفلات",
  SESSIONS: "حلقات",
  SUMMER: "البرنامج الصيفي",
  LIFE: "حياة الجمعية",
}
const ACHIEVEMENT_CATEGORIES: Record<AchievementCategory, string> = {
  QURAN: "القرآن",
  COMPETITION: "مسابقة",
  AWARD: "جائزة",
  COMMUNITY: "المجتمع",
  ASSOCIATION: "الجمعية",
  MILESTONE: "محطة",
}
const options = (record: Record<string, string>) => Object.entries(record).map(([value, label]) => ({ value, label }))
const activeBranches = branches.filter((b) => b.status === "ACTIVE").map((b) => ({ value: b.id, label: b.name }))

const title = (key: string, label = "العنوان"): CmsField => ({ key, label, type: "text", required: true, wide: true })

/** One config per CMS section — the generic manager does the rest. */
const CONFIGS: { [K in CmsCollection]: CmsConfig<K> & { slug: string; icon: typeof Home; card: string } } = {
  heroSlides: {
    collection: "heroSlides", slug: "home", icon: Home, card: "الصفحة الرئيسية (الواجهة)",
    title: "واجهة الصفحة الرئيسية", description: "صور وعبارات الواجهة. تظهر الشرائح المفعّلة فقط، بالترتيب المحدّد.",
    addLabel: "إضافة شريحة", emptyLabel: "لا توجد شرائح بعد",
    publishKey: "isActive", ordered: true, defaults: { isActive: true, ctaHref: "/registration", ctaLabelAr: "سجل الآن" },
    fields: [
      { key: "imageUrl", label: "الصورة", type: "image", required: true },
      { key: "titleAr", label: "العنوان", type: "text", wide: true },
      { key: "subtitleAr", label: "النص", type: "textarea" },
      { key: "ctaLabelAr", label: "نص الزر", type: "text" },
      { key: "ctaHref", label: "رابط الزر", type: "url", description: "مثال: /registration" },
      { key: "isActive", label: "مفعّلة", type: "checkbox" },
    ],
    summary: (s) => ({ title: s.titleAr || "شريحة دون عنوان", subtitle: s.subtitleAr, image: s.imageUrl }),
    publicHref: () => "/",
  },
  serviceOfferings: {
    collection: "serviceOfferings", slug: "offerings", icon: Sparkles, card: "ماذا نقدم",
    title: "ماذا نقدم لطلابنا؟", description: "الخدمات التي تقدّمها الجمعية لطلبتها، كما تظهر في الصفحة الرئيسية.",
    addLabel: "إضافة عنصر", emptyLabel: "لا توجد عناصر بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: true, icon: "book" },
    fields: [title("titleAr"), { key: "descriptionAr", label: "الوصف", type: "textarea" }, { key: "icon", label: "الأيقونة", type: "select", options: ICON_OPTIONS }, { key: "isPublished", label: "منشور", type: "checkbox" }],
    summary: (o) => ({ title: o.titleAr, subtitle: o.descriptionAr }),
    publicHref: () => "/#offer",
  },
  publicPrograms: {
    collection: "publicPrograms", slug: "programs", icon: Layers, card: "البرامج",
    title: "البرامج", description: "التعريف التسويقي ببرامج الجمعية (منفصل عن المجموعات التشغيلية).",
    addLabel: "إضافة برنامج", emptyLabel: "لا توجد برامج بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: true, icon: "book" },
    fields: [title("titleAr"), { key: "descriptionAr", label: "الوصف", type: "textarea", required: true }, { key: "imageUrl", label: "الصورة", type: "image" }, { key: "icon", label: "الأيقونة", type: "select", options: ICON_OPTIONS }, { key: "isPublished", label: "منشور", type: "checkbox" }],
    summary: (p) => ({ title: p.titleAr, subtitle: p.descriptionAr, image: p.imageUrl }),
    publicHref: () => "/programs",
  },
  publicGroups: {
    collection: "publicGroups", slug: "groups", icon: FolderKanban, card: "مجموعات ستفتح قريباً",
    title: "مجموعات ستفتح قريباً", description: "إعلان مجموعات وبرامج جديدة قبل انطلاقها. لا تظهر أي مجموعة تشغيلية في الموقع إلا عبر هذا الإعلان.",
    addLabel: "إعلان مجموعة", emptyLabel: "لا توجد مجموعات معلنة بعد", publishKey: "isPublished", ordered: true,
    defaults: { isPublished: true, publicStatus: "COMING_SOON", registrationOpen: true },
    fields: [
      title("titleAr", "اسم المجموعة / البرنامج"),
      { key: "audienceAr", label: "الفئة المستهدفة", type: "text", required: true },
      { key: "descriptionAr", label: "وصف قصير", type: "textarea" },
      { key: "groupId", label: "المجموعة التشغيلية المرتبطة", type: "select", options: groups.map((g) => ({ value: g.id, label: g.name })), description: "اختياري — للربط بطلبات التسجيل" },
      { key: "branchId", label: "الفرع", type: "select", options: activeBranches },
      { key: "startDate", label: "تاريخ الانطلاق", type: "date" },
      { key: "scheduleAr", label: "التوقيت التقريبي", type: "text" },
      { key: "publicStatus", label: "الحالة", type: "select", required: true, options: [{ value: "COMING_SOON", label: "يفتح قريباً" }, { value: "OPEN", label: "التسجيل مفتوح" }, { value: "CLOSED", label: "مغلق (لا يظهر)" }] },
      { key: "imageUrl", label: "الصورة", type: "image" },
      { key: "registrationOpen", label: "إتاحة زر «سجل الآن»", type: "checkbox" },
      { key: "isPublished", label: "منشور", type: "checkbox" },
    ],
    summary: (g) => ({
      title: g.titleAr,
      subtitle: [g.audienceAr, g.startDate && `يبدأ ${formatDate(g.startDate)}`].filter(Boolean).join(" · "),
      image: g.imageUrl,
      badges: [g.publicStatus === "OPEN" ? "التسجيل مفتوح" : g.publicStatus === "CLOSED" ? "مغلق" : "يفتح قريباً", ...(g.registrationOpen ? [] : ["دون تسجيل"])],
    }),
    publicHref: () => "/groups",
  },
  publicEvents: {
    collection: "publicEvents", slug: "events", icon: CalendarDays, card: "الفعاليات",
    title: "الفعاليات", description: "أنشطة الجمعية العامة (منفصلة عن حصص الحلقات). تظهر فقط إذا كانت عامة ومنشورة.",
    addLabel: "إضافة فعالية", emptyLabel: "لا توجد فعاليات بعد", publishKey: "isPublished", ordered: false,
    defaults: { isPublished: true, isPublic: true, isCancelled: false, startDate: MOCK_TODAY },
    sort: (a, b) => b.startDate.localeCompare(a.startDate),
    fields: [
      title("titleAr"),
      { key: "descriptionAr", label: "الوصف", type: "textarea", required: true },
      { key: "startDate", label: "التاريخ", type: "date", required: true },
      { key: "endDate", label: "تاريخ النهاية", type: "date" },
      { key: "time", label: "الساعة", type: "time" },
      { key: "location", label: "المكان", type: "text" },
      { key: "imageUrl", label: "الصورة", type: "image" },
      { key: "isPublic", label: "فعالية عامة", type: "checkbox", description: "غير العامة لا تظهر في الموقع" },
      { key: "isPublished", label: "منشورة", type: "checkbox" },
    ],
    validate: (v) => ({ endDate: v.endDate && v.startDate && String(v.endDate) < String(v.startDate) ? "تاريخ النهاية قبل البداية" : undefined }),
    extraFlags: [
      { key: "isPublic", on: "جعلها عامة", off: "جعلها داخلية (غير عامة)", icon: Unlock },
      { key: "isCancelled", on: "إلغاء الفعالية", off: "إعادة الفعالية", icon: CalendarX2 },
    ],
    summary: (e) => ({
      title: e.titleAr,
      subtitle: [formatDate(e.startDate), e.time, e.location].filter(Boolean).join(" · "),
      image: e.imageUrl,
      badges: [
        ...(e.isPublic ? [] : ["داخلية"]),
        { UPCOMING: "قادمة", COMPLETED: "انتهت", CANCELLED: "ملغاة" }[publicEventStatus(e, MOCK_TODAY)],
      ],
    }),
    publicHref: () => "/events",
  },
  newsArticles: {
    collection: "newsArticles", slug: "news", icon: Newspaper, card: "الأخبار",
    title: "الأخبار", description: "أخبار الموقع العامة (منفصلة عن الإعلانات الداخلية).",
    addLabel: "إضافة خبر", emptyLabel: "لا توجد أخبار بعد", publishKey: "isPublished", ordered: false,
    defaults: { isPublished: true, publishedAt: MOCK_TODAY },
    sort: (a, b) => b.publishedAt.localeCompare(a.publishedAt),
    fields: [
      title("titleAr"),
      { key: "excerptAr", label: "الملخّص", type: "textarea", required: true },
      { key: "contentAr", label: "المحتوى", type: "textarea", required: true, description: "افصل الفقرات بسطر فارغ" },
      { key: "coverImageUrl", label: "صورة الغلاف", type: "image" },
      { key: "publishedAt", label: "تاريخ النشر", type: "date", required: true },
      { key: "isPublished", label: "منشور", type: "checkbox" },
    ],
    summary: (n) => ({ title: n.titleAr, subtitle: formatDate(n.publishedAt), image: n.coverImageUrl, badges: n.publishedAt > MOCK_TODAY ? ["مبرمج"] : [] }),
    publicHref: (n) => `/news/${n.id}`,
  },
  galleryImages: {
    collection: "galleryImages", slug: "gallery", icon: ImageIcon, card: "الصور",
    title: "معرض الصور", description: "صور حياة الجمعية في الصفحة الرئيسية ومعرض الصور.",
    addLabel: "إضافة صورة", emptyLabel: "لا توجد صور بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: true },
    fields: [
      { key: "imageUrl", label: "الصورة", type: "image", required: true },
      { key: "titleAr", label: "العنوان", type: "text", wide: true },
      { key: "descriptionAr", label: "التعليق", type: "textarea" },
      { key: "category", label: "التصنيف", type: "select", options: options(GALLERY_CATEGORIES) },
      { key: "isPublished", label: "منشورة", type: "checkbox" },
    ],
    summary: (g) => ({ title: g.titleAr || "صورة دون عنوان", subtitle: g.category && GALLERY_CATEGORIES[g.category], image: g.imageUrl }),
    publicHref: () => "/gallery",
  },
  quranGraduates: {
    collection: "quranGraduates", slug: "graduates", icon: Award, card: "الخاتمون",
    title: "الخاتمون", description: "لا يظهر أي طالب تلقائيًا: تُضاف الأسماء وتُنشر هنا فقط بقرار من الإدارة.",
    addLabel: "إضافة خاتم", emptyLabel: "لا توجد أسماء بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: true, completionYear: Number(MOCK_TODAY.slice(0, 4)) },
    fields: [
      { key: "fullName", label: "الاسم الكامل", type: "text", required: true, wide: true },
      { key: "completionYear", label: "سنة الختم", type: "number" },
      { key: "completionDate", label: "تاريخ الختم", type: "date" },
      { key: "shortMessage", label: "كلمة قصيرة", type: "textarea" },
      { key: "photoUrl", label: "الصورة", type: "image" },
      { key: "isPublished", label: "منشور", type: "checkbox" },
    ],
    summary: (g) => ({ title: g.fullName, subtitle: g.completionYear ? `ختم القرآن · ${g.completionYear}` : undefined, image: g.photoUrl }),
    publicHref: () => "/graduates",
  },
  administrationMembers: {
    collection: "administrationMembers", slug: "administration", icon: UsersRound, card: "أعضاء الإدارة",
    title: "أعضاء إدارة الجمعية", description: "الهيئة المديرة كما تظهر في صفحة «عن الجمعية» — مستقلة عن حسابات المنصة.",
    addLabel: "إضافة عضو", emptyLabel: "لا يوجد أعضاء بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: true },
    fields: [
      { key: "fullName", label: "الاسم الكامل", type: "text", required: true },
      { key: "roleAr", label: "الصفة", type: "text", required: true, description: "مثال: رئيس الجمعية" },
      { key: "shortBioAr", label: "نبذة قصيرة", type: "textarea" },
      { key: "photoUrl", label: "الصورة", type: "image" },
      { key: "isPublished", label: "منشور", type: "checkbox" },
    ],
    summary: (m) => ({ title: m.fullName, subtitle: m.roleAr, image: m.photoUrl }),
    publicHref: () => "/about#board",
  },
  achievements: {
    collection: "achievements", slug: "achievements", icon: Trophy, card: "إنجازات الجمعية",
    title: "إنجازات الجمعية", description: "الإنجازات المنشورة تظهر في صفحة الإنجازات؛ المميّزة منها تظهر في الصفحة الرئيسية.",
    addLabel: "إضافة إنجاز", emptyLabel: "لا توجد إنجازات بعد", publishKey: "isPublished", ordered: true,
    defaults: { isPublished: true, isFeatured: false, year: Number(MOCK_TODAY.slice(0, 4)) },
    fields: [
      title("titleAr"),
      { key: "descriptionAr", label: "الوصف", type: "textarea", required: true },
      { key: "year", label: "السنة", type: "number" },
      { key: "date", label: "التاريخ", type: "date" },
      { key: "category", label: "التصنيف", type: "select", options: options(ACHIEVEMENT_CATEGORIES) },
      { key: "imageUrl", label: "الصورة", type: "image" },
      { key: "isFeatured", label: "مميّز (يظهر في الصفحة الرئيسية)", type: "checkbox" },
      { key: "isPublished", label: "منشور", type: "checkbox" },
    ],
    extraFlags: [{ key: "isFeatured", on: "تمييز في الصفحة الرئيسية", off: "إلغاء التمييز", icon: Star }],
    summary: (a) => ({ title: a.titleAr, subtitle: [a.year, a.category && ACHIEVEMENT_CATEGORIES[a.category]].filter(Boolean).join(" · "), image: a.imageUrl, badges: a.isFeatured ? ["مميّز"] : [] }),
    publicHref: () => "/achievements",
  },
}

const SECTIONS = Object.values(CONFIGS)

/** /admin/website/[section] */
export function CmsSection({ slug }: { slug: string }) {
  const config = SECTIONS.find((c) => c.slug === slug)
  if (!config) return null
  // Each config is typed per collection; the manager is generic over it
  return <CmsManager config={config as unknown as CmsConfig<CmsCollection>} />
}

/** /admin/website — entry cards, not another analytics dashboard. */
export function CmsDashboard() {
  const state = useOperations()
  const count = (c: (typeof SECTIONS)[number]) => {
    const list = state[c.collection] as unknown as Record<string, unknown>[]
    return { total: list.length, visible: list.filter((i) => i[c.publishKey]).length }
  }
  return (
    <>
      <PageHeader
        title="الموقع الإلكتروني"
        description="إدارة محتوى الموقع العام دون تعديل الشيفرة: النصوص، الصور، الفعاليات، الأخبار والإنجازات."
        actions={
          <Button asChild variant="outline">
            <Link href="/" target="_blank"><Globe />عرض الموقع</Link>
          </Button>
        }
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <li>
          <Link href="/admin/website/settings" className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card className="h-full flex-row items-center gap-4 p-4 transition-colors hover:border-primary/40">
              <span className="flex size-11 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground"><Settings className="size-5" aria-hidden /></span>
              <div>
                <p className="font-medium">إعدادات الموقع</p>
                <p className="text-xs text-muted-foreground">التعريف، الرسالة، الاستقبال والشبكات، التسجيل</p>
              </div>
            </Card>
          </Link>
        </li>
        {SECTIONS.map((c) => {
          const Icon = c.icon
          const { total, visible } = count(c)
          return (
            <li key={c.slug}>
              <Link href={`/admin/website/${c.slug}`} className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card className="h-full flex-row items-center gap-4 p-4 transition-colors hover:border-primary/40">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground"><Icon className="size-5" aria-hidden /></span>
                  <div>
                    <p className="font-medium">{c.card}</p>
                    <p className="text-xs text-muted-foreground">{visible} ظاهر في الموقع من {total}</p>
                  </div>
                </Card>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}

type SettingsKey = keyof SiteSettings
const SETTINGS_FIELDS: { key: SettingsKey; label: string; long?: boolean; ltr?: boolean; required?: boolean; hint?: string }[] = [
  { key: "shortDescriptionAr", label: "تعريف قصير", long: true, required: true },
  { key: "aboutAr", label: "من نحن", long: true, required: true, hint: "افصل الفقرات بسطر فارغ" },
  { key: "historyAr", label: "تاريخ الجمعية", long: true },
  { key: "missionAr", label: "رسالتنا", long: true, required: true },
  { key: "visionAr", label: "رؤيتنا", long: true, required: true },
  { key: "valuesAr", label: "قيمنا", long: true, hint: "قيمة في كل سطر" },
  { key: "openingHoursAr", label: "أوقات الاستقبال" },
  { key: "mapUrl", label: "رابط الخريطة", ltr: true },
  { key: "facebookUrl", label: "فيسبوك", ltr: true },
  { key: "instagramUrl", label: "إنستغرام", ltr: true },
  { key: "youtubeUrl", label: "يوتيوب", ltr: true },
]

/** One SiteSettings record feeds the header, footer, home, about and contact pages. */
export function SiteSettingsForm() {
  const { siteSettings } = useOperations()
  const [values, setValues] = useState<SiteSettings>(siteSettings)
  const [submitted, setSubmitted] = useState(false)
  const errors = Object.fromEntries(SETTINGS_FIELDS.map((f) => [f.key, f.required && !String(values[f.key] ?? "").trim() ? "حقل مطلوب" : undefined]))
  const set = (key: SettingsKey, value: unknown) => setValues((v) => ({ ...v, [key]: value }))

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الموقع الإلكتروني", href: "/admin/website" }, { label: "إعدادات الموقع" }]} />
      <PageHeader title="إعدادات الموقع" description={`آخر تحديث: ${formatDate(siteSettings.updatedAt)}`} />
      <p className="mb-6 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <BadgeInfo className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          اسم الجمعية وشعارها وهاتفها وبريدها وعنوانها تُدار من{" "}
          <Link href="/admin/settings/association" className="font-medium text-primary hover:underline">إعدادات الجمعية</Link>
          {" "}وتظهر تلقائيًا في الموقع. هذه الصفحة خاصة بمحتوى الموقع العام.
        </span>
      </p>
      <form
        noValidate
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
          if (Object.values(errors).some(Boolean)) return
          const patch = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === "string" ? v.trim() || undefined : v])) as Partial<SiteSettings>
          operations.updateSiteSettings(patch, MOCK_TODAY)
          toast.success("تم حفظ إعدادات الموقع", { description: "التغييرات ظاهرة مباشرة في الموقع." })
        }}
      >
        <Card className="p-5 sm:p-6">
          <FormSection title="التعريف بالجمعية">
            {SETTINGS_FIELDS.filter((f) => f.long).map((f) => (
              <FormField key={f.key} id={`set-${f.key}`} label={f.label} required={f.required} description={f.hint} error={submitted ? errors[f.key] : undefined} className="sm:col-span-2">
                {f.long ? (
                  <Textarea id={`set-${f.key}`} rows={f.key === "aboutAr" || f.key === "historyAr" ? 6 : 3} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <Input id={`set-${f.key}`} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </FormField>
            ))}
          </FormSection>
        </Card>
        <Card className="p-5 sm:p-6">
          <FormSection title="الاستقبال والشبكات">
            {SETTINGS_FIELDS.filter((f) => !f.long).map((f) => (
              <FormField key={f.key} id={`set-${f.key}`} label={f.label} optional>
                <Input id={`set-${f.key}`} dir={f.ltr ? "ltr" : undefined} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
              </FormField>
            ))}
            <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-primary" checked={values.registrationEnabled} onChange={(e) => set("registrationEnabled", e.target.checked)} />
              {values.registrationEnabled ? <Unlock className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              التسجيل عبر الموقع مفتوح
            </label>
          </FormSection>
        </Card>
        <div className="sticky bottom-3 flex justify-end">
          <Button type="submit" size="lg" className="shadow-lg">حفظ الإعدادات</Button>
        </div>
      </form>
    </>
  )
}
