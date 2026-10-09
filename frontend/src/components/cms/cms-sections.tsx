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
  Loader2,
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
import { QueryState } from "@/components/shared/query-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { errorMessage } from "@/lib/api/errors"
import { useAdminSettings, useUpdateSettings, type AdminSettingsDto, type SettingsPatch } from "@/lib/api/hooks/settings"
import { todayInTunis, tunisDateOf } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import type { AchievementCategory, GalleryCategory } from "@/types/domain"

import { CmsManager, useCmsItems, type CmsConfig, type CmsField } from "./cms-manager"

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
const CONSENT_GIVERS = { GRADUATE: "الخاتم نفسه (راشد)", GUARDIAN: "وليّ الأمر" }
const options = (record: Record<string, string>) => Object.entries(record).map(([value, label]) => ({ value, label }))
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined)

const title = (key: string, label = "العنوان"): CmsField => ({ key, label, type: "text", required: true, wide: true })

type SectionConfig = CmsConfig & { slug: string; icon: typeof Home; card: string }

/** One config per CMS section (API field names) — the generic manager does the rest. */
function sectionConfigs(today: string): SectionConfig[] {
  const year = Number(today.slice(0, 4))
  return [
    {
      api: "hero-slides", slug: "home", icon: Home, card: "الصفحة الرئيسية (الواجهة)",
      title: "واجهة الصفحة الرئيسية", description: "صور وعبارات الواجهة. تظهر الشرائح المفعّلة فقط، بالترتيب المحدّد.",
      addLabel: "إضافة شريحة", emptyLabel: "لا توجد شرائح بعد",
      publishKey: "isActive", ordered: true, defaults: { isActive: true, ctaHref: "/registration", ctaLabel: "سجل الآن" },
      fields: [
        { key: "imageUrl", label: "الصورة", type: "image", required: true },
        { key: "title", label: "العنوان", type: "text", wide: true },
        { key: "subtitle", label: "النص", type: "textarea" },
        { key: "ctaLabel", label: "نص الزر", type: "text" },
        { key: "ctaHref", label: "رابط الزر", type: "url", description: "مثال: /registration" },
        { key: "isActive", label: "مفعّلة", type: "checkbox" },
      ],
      summary: (s) => ({ title: str(s.title) ?? "شريحة دون عنوان", subtitle: str(s.subtitle), image: str(s.imageUrl) }),
      publicHref: () => "/",
    },
    {
      api: "services", slug: "offerings", icon: Sparkles, card: "ماذا نقدم",
      title: "ماذا نقدم لطلابنا؟", description: "الخدمات التي تقدّمها الجمعية لطلبتها، كما تظهر في الصفحة الرئيسية.",
      addLabel: "إضافة عنصر", emptyLabel: "لا توجد عناصر بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: true, icon: "book" },
      fields: [title("title"), { key: "description", label: "الوصف", type: "textarea" }, { key: "icon", label: "الأيقونة", type: "select", options: ICON_OPTIONS }, { key: "isPublished", label: "منشور", type: "checkbox" }],
      summary: (o) => ({ title: String(o.title), subtitle: str(o.description) }),
      publicHref: () => "/#offer",
    },
    {
      api: "programs", slug: "programs", icon: Layers, card: "البرامج",
      title: "البرامج", description: "التعريف التسويقي ببرامج الجمعية (منفصل عن المجموعات التشغيلية).",
      addLabel: "إضافة برنامج", emptyLabel: "لا توجد برامج بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: true, icon: "book" },
      fields: [title("title"), { key: "description", label: "الوصف", type: "textarea", required: true }, { key: "imageUrl", label: "الصورة", type: "image" }, { key: "icon", label: "الأيقونة", type: "select", options: ICON_OPTIONS }, { key: "isPublished", label: "منشور", type: "checkbox" }],
      summary: (p) => ({ title: String(p.title), subtitle: str(p.description), image: str(p.imageUrl) }),
      publicHref: () => "/programs",
    },
    {
      api: "upcoming-groups", slug: "groups", icon: FolderKanban, card: "مجموعات ستفتح قريباً",
      title: "مجموعات ستفتح قريباً", description: "إعلان مجموعات وبرامج جديدة قبل انطلاقها. لا تظهر أي مجموعة تشغيلية في الموقع إلا عبر هذا الإعلان.",
      addLabel: "إعلان مجموعة", emptyLabel: "لا توجد مجموعات معلنة بعد", publishKey: "isPublished", ordered: true,
      defaults: { isPublished: true, publicStatus: "COMING_SOON", registrationOpen: true },
      fields: [
        title("title", "اسم المجموعة / البرنامج"),
        { key: "audience", label: "الفئة المستهدفة", type: "text", required: true },
        { key: "description", label: "وصف قصير", type: "textarea" },
        { key: "groupId", label: "المجموعة التشغيلية المرتبطة", type: "select", optionsSource: "groups", description: "اختياري — للربط بطلبات التسجيل" },
        { key: "branchId", label: "الفرع", type: "select", optionsSource: "branches" },
        { key: "startDate", label: "تاريخ الانطلاق", type: "date" },
        { key: "schedule", label: "التوقيت التقريبي", type: "text" },
        { key: "publicStatus", label: "الحالة", type: "select", required: true, options: [{ value: "COMING_SOON", label: "يفتح قريباً" }, { value: "OPEN", label: "التسجيل مفتوح" }, { value: "CLOSED", label: "مغلق (لا يظهر)" }] },
        { key: "imageUrl", label: "الصورة", type: "image" },
        { key: "registrationOpen", label: "إتاحة زر «سجل الآن»", type: "checkbox" },
        { key: "isPublished", label: "منشور", type: "checkbox" },
      ],
      summary: (g) => ({
        title: String(g.title),
        subtitle: [str(g.audience), str(g.startDate) && `يبدأ ${formatDate(String(g.startDate))}`].filter(Boolean).join(" · "),
        image: str(g.imageUrl),
        badges: [g.publicStatus === "OPEN" ? "التسجيل مفتوح" : g.publicStatus === "CLOSED" ? "مغلق" : "يفتح قريباً", ...(g.registrationOpen ? [] : ["دون تسجيل"])],
      }),
      publicHref: () => "/groups",
    },
    {
      api: "events", slug: "events", icon: CalendarDays, card: "الفعاليات",
      title: "الفعاليات", description: "أنشطة الجمعية العامة (منفصلة عن حصص الحلقات). تظهر فقط إذا كانت عامة ومنشورة.",
      addLabel: "إضافة فعالية", emptyLabel: "لا توجد فعاليات بعد", publishKey: "isPublished", ordered: false,
      defaults: { isPublished: true, isPublic: true, isCancelled: false, startDate: today },
      fields: [
        title("title"),
        { key: "description", label: "الوصف", type: "textarea", required: true },
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
        title: String(e.title),
        subtitle: [formatDate(String(e.startDate)), str(e.time), str(e.location)].filter(Boolean).join(" · "),
        image: str(e.imageUrl),
        badges: [
          ...(e.isPublic ? [] : ["داخلية"]),
          ...(typeof e.status === "string" ? [{ UPCOMING: "قادمة", COMPLETED: "انتهت", CANCELLED: "ملغاة" }[e.status] ?? e.status] : []),
        ],
      }),
      publicHref: () => "/events",
    },
    {
      api: "news", slug: "news", icon: Newspaper, card: "الأخبار",
      title: "الأخبار", description: "أخبار الموقع العامة (منفصلة عن الإعلانات الداخلية). خبر بتاريخ نشر لاحق يبقى مخفيًا حتى ذلك اليوم.",
      addLabel: "إضافة خبر", emptyLabel: "لا توجد أخبار بعد", publishKey: "isPublished", ordered: false,
      defaults: { isPublished: true, publishedAt: today },
      fields: [
        title("title"),
        { key: "excerpt", label: "الملخّص", type: "textarea", required: true },
        { key: "content", label: "المحتوى", type: "textarea", required: true, description: "افصل الفقرات بسطر فارغ" },
        { key: "coverImageUrl", label: "صورة الغلاف", type: "image" },
        { key: "publishedAt", label: "تاريخ النشر", type: "date", required: true },
        { key: "isPublished", label: "منشور", type: "checkbox" },
      ],
      summary: (n) => ({
        title: String(n.title),
        subtitle: str(n.publishedAt) && formatDate(String(n.publishedAt)),
        image: str(n.coverImageUrl),
        badges: n.state === "SCHEDULED" ? ["مبرمج"] : [],
      }),
      publicHref: (n) => `/news/${n.id}`,
    },
    {
      api: "gallery", slug: "gallery", icon: ImageIcon, card: "الصور",
      title: "معرض الصور", description: "صور حياة الجمعية في الصفحة الرئيسية ومعرض الصور.",
      addLabel: "إضافة صورة", emptyLabel: "لا توجد صور بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: true },
      fields: [
        { key: "imageUrl", label: "الصورة", type: "image", required: true },
        { key: "title", label: "العنوان", type: "text", wide: true },
        { key: "description", label: "التعليق", type: "textarea" },
        { key: "category", label: "التصنيف", type: "select", options: options(GALLERY_CATEGORIES) },
        { key: "isPublished", label: "منشورة", type: "checkbox" },
      ],
      summary: (g) => ({ title: str(g.title) ?? "صورة دون عنوان", subtitle: GALLERY_CATEGORIES[g.category as GalleryCategory], image: str(g.imageUrl) }),
      publicHref: () => "/gallery",
    },
    {
      api: "graduates", slug: "graduates", icon: Award, card: "الخاتمون",
      title: "الخاتمون",
      description: "لا يظهر أي طالب تلقائيًا: تُضاف الأسماء هنا، ولا يُنشر الاسم أو الصورة إلا بعد تسجيل الموافقة (موافقة الولي للقاصر).",
      addLabel: "إضافة خاتم", emptyLabel: "لا توجد أسماء بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: false, completionYear: year },
      fields: [
        { key: "fullName", label: "الاسم الكامل", type: "text", required: true, wide: true },
        { key: "completionYear", label: "سنة الختم", type: "number" },
        { key: "completionDate", label: "تاريخ الختم", type: "date" },
        { key: "shortMessage", label: "كلمة قصيرة", type: "textarea" },
        { key: "photoUrl", label: "الصورة", type: "image" },
        { key: "consentGivenBy", label: "الموافقة على النشر", type: "select", options: options(CONSENT_GIVERS), description: "مطلوبة قبل النشر" },
        { key: "isPublished", label: "منشور", type: "checkbox" },
      ],
      summary: (g) => ({
        title: String(g.fullName),
        subtitle: g.completionYear ? `ختم القرآن · ${g.completionYear}` : undefined,
        image: str(g.photoUrl),
        badges: g.consentGivenBy ? [] : ["دون موافقة مسجّلة"],
      }),
      publicHref: () => "/graduates",
    },
    {
      api: "administration-members", slug: "administration", icon: UsersRound, card: "أعضاء الإدارة",
      title: "أعضاء إدارة الجمعية", description: "الهيئة المديرة كما تظهر في صفحة «عن الجمعية» — مستقلة عن حسابات المنصة.",
      addLabel: "إضافة عضو", emptyLabel: "لا يوجد أعضاء بعد", publishKey: "isPublished", ordered: true, defaults: { isPublished: true },
      fields: [
        { key: "fullName", label: "الاسم الكامل", type: "text", required: true },
        { key: "role", label: "الصفة", type: "text", required: true, description: "مثال: رئيس الجمعية" },
        { key: "shortBio", label: "نبذة قصيرة", type: "textarea" },
        { key: "photoUrl", label: "الصورة", type: "image" },
        { key: "isPublished", label: "منشور", type: "checkbox" },
      ],
      summary: (m) => ({ title: String(m.fullName), subtitle: str(m.role), image: str(m.photoUrl) }),
      publicHref: () => "/about#board",
    },
    {
      api: "achievements", slug: "achievements", icon: Trophy, card: "إنجازات الجمعية",
      title: "إنجازات الجمعية", description: "الإنجازات المنشورة تظهر في صفحة الإنجازات؛ المميّزة منها تظهر في الصفحة الرئيسية.",
      addLabel: "إضافة إنجاز", emptyLabel: "لا توجد إنجازات بعد", publishKey: "isPublished", ordered: true,
      defaults: { isPublished: true, isFeatured: false, year },
      fields: [
        title("title"),
        { key: "description", label: "الوصف", type: "textarea", required: true },
        { key: "year", label: "السنة", type: "number" },
        { key: "date", label: "التاريخ", type: "date" },
        { key: "category", label: "التصنيف", type: "select", options: options(ACHIEVEMENT_CATEGORIES) },
        { key: "imageUrl", label: "الصورة", type: "image" },
        { key: "isFeatured", label: "مميّز (يظهر في الصفحة الرئيسية)", type: "checkbox" },
        { key: "isPublished", label: "منشور", type: "checkbox" },
      ],
      extraFlags: [{ key: "isFeatured", on: "تمييز في الصفحة الرئيسية", off: "إلغاء التمييز", icon: Star }],
      summary: (a) => ({
        title: String(a.title),
        subtitle: [a.year, ACHIEVEMENT_CATEGORIES[a.category as AchievementCategory]].filter(Boolean).join(" · "),
        image: str(a.imageUrl),
        badges: a.isFeatured ? ["مميّز"] : [],
      }),
      publicHref: () => "/achievements",
    },
  ]
}

/** /admin/website/[section] */
export function CmsSection({ slug }: { slug: string }) {
  const config = sectionConfigs(todayInTunis()).find((c) => c.slug === slug)
  if (!config) return null
  return <CmsManager config={config} />
}

function SectionCard({ config }: { config: SectionConfig }) {
  const Icon = config.icon
  const { data } = useCmsItems(config.api)
  const visible = data?.filter((i) => i[config.publishKey]).length
  return (
    <Link href={`/admin/website/${config.slug}`} className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Card className="h-full flex-row items-center gap-4 p-4 transition-colors hover:border-primary/40">
        <span className="flex size-11 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground"><Icon className="size-5" aria-hidden /></span>
        <div>
          <p className="font-medium">{config.card}</p>
          <p className="text-xs text-muted-foreground">{data ? `${visible} ظاهر في الموقع من ${data.length}` : "…"}</p>
        </div>
      </Card>
    </Link>
  )
}

/** /admin/website — entry cards, not another analytics dashboard. */
export function CmsDashboard() {
  const sections = sectionConfigs(todayInTunis())
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
        {sections.map((c) => (
          <li key={c.slug}>
            <SectionCard config={c} />
          </li>
        ))}
      </ul>
    </>
  )
}

type WebsiteSettings = NonNullable<AdminSettingsDto["website"]>
type SettingsKey = Exclude<keyof WebsiteSettings, "updatedAt" | "registrationEnabled">
const SETTINGS_FIELDS: { key: SettingsKey; label: string; long?: boolean; ltr?: boolean; required?: boolean; hint?: string }[] = [
  { key: "shortDescription", label: "تعريف قصير", long: true, required: true },
  { key: "about", label: "من نحن", long: true, required: true, hint: "افصل الفقرات بسطر فارغ" },
  { key: "history", label: "تاريخ الجمعية", long: true },
  { key: "mission", label: "رسالتنا", long: true, required: true },
  { key: "vision", label: "رؤيتنا", long: true, required: true },
  { key: "values", label: "قيمنا", long: true, hint: "قيمة في كل سطر" },
  { key: "openingHours", label: "أوقات الاستقبال" },
  { key: "mapUrl", label: "رابط الخريطة", ltr: true, hint: "رابط https://" },
  { key: "facebookUrl", label: "فيسبوك", ltr: true },
  { key: "instagramUrl", label: "إنستغرام", ltr: true },
  { key: "youtubeUrl", label: "يوتيوب", ltr: true },
]

/** One website record (admin settings → website) feeds the header, footer, home, about and contact pages. */
export function SiteSettingsForm() {
  const query = useAdminSettings()
  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الموقع الإلكتروني", href: "/admin/website" }, { label: "إعدادات الموقع" }]} />
      <QueryState query={query}>
        {query.data && <SiteSettingsFields key={query.data.website?.updatedAt ?? "new"} website={query.data.website} />}
      </QueryState>
    </>
  )
}

const EMPTY_WEBSITE = {
  shortDescription: "", about: "", history: "", mission: "", vision: "", values: "", openingHours: "",
  mapUrl: "", facebookUrl: "", instagramUrl: "", youtubeUrl: "", registrationEnabled: true,
}

function SiteSettingsFields({ website }: { website: AdminSettingsDto["website"] }) {
  const update = useUpdateSettings()
  const [values, setValues] = useState(() => {
    const initial: Record<string, string | boolean> = { ...EMPTY_WEBSITE }
    if (website) for (const [k, v] of Object.entries(website)) if (k in initial) initial[k] = v ?? ""
    return initial
  })
  const [submitted, setSubmitted] = useState(false)
  const errors = Object.fromEntries(SETTINGS_FIELDS.map((f) => [f.key, f.required && !String(values[f.key] ?? "").trim() ? "حقل مطلوب" : undefined]))
  const set = (key: string, value: string | boolean) => setValues((v) => ({ ...v, [key]: value }))

  return (
    <>
      <PageHeader title="إعدادات الموقع" description={website ? `آخر تحديث: ${formatDate(tunisDateOf(website.updatedAt))}` : undefined} />
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
          if (update.isPending || Object.values(errors).some(Boolean)) return
          const patch = Object.fromEntries(
            Object.entries(values).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v])
          ) as SettingsPatch["website"]
          update
            .mutateAsync({ website: patch })
            .then(() => toast.success("تم حفظ إعدادات الموقع", { description: "تظهر التغييرات في الموقع عند الزيارة التالية." }))
            .catch(() => {})
        }}
      >
        <Card className="p-5 sm:p-6">
          <FormSection title="التعريف بالجمعية">
            {SETTINGS_FIELDS.filter((f) => f.long).map((f) => (
              <FormField key={f.key} id={`set-${f.key}`} label={f.label} required={f.required} description={f.hint} error={submitted ? errors[f.key] : undefined} className="sm:col-span-2">
                <Textarea id={`set-${f.key}`} rows={f.key === "about" || f.key === "history" ? 6 : 3} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
              </FormField>
            ))}
          </FormSection>
        </Card>
        <Card className="p-5 sm:p-6">
          <FormSection title="الاستقبال والشبكات">
            {SETTINGS_FIELDS.filter((f) => !f.long).map((f) => (
              <FormField key={f.key} id={`set-${f.key}`} label={f.label} optional description={f.hint}>
                <Input id={`set-${f.key}`} dir={f.ltr ? "ltr" : undefined} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} />
              </FormField>
            ))}
            <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4 accent-primary" checked={Boolean(values.registrationEnabled)} onChange={(e) => set("registrationEnabled", e.target.checked)} />
              {values.registrationEnabled ? <Unlock className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              التسجيل عبر الموقع مفتوح
            </label>
          </FormSection>
        </Card>
        {update.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{errorMessage(update.error)}</AlertDescription>
          </Alert>
        )}
        <div className="sticky bottom-3 flex justify-end">
          <Button type="submit" size="lg" className="shadow-lg" disabled={update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" />}
            حفظ الإعدادات
          </Button>
        </div>
      </form>
    </>
  )
}
