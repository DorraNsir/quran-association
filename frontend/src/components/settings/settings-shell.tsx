"use client"

import { ArrowLeft, CalendarRange, DatabaseBackup, Globe, Landmark, Settings2, SlidersHorizontal, UserCog, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getCurrentAcademicYear } from "@/lib/academic-years"
import { formatNumericDate } from "@/lib/format"
import { CALENDAR_VIEWS } from "@/lib/platform-settings"
import { MOCK_TODAY } from "@/lib/mock/reference-date"
import { useOperations } from "@/lib/store/operations"
import { cn } from "@/lib/utils"

export type SettingsSlug = "association" | "system" | "academic-year" | "preferences" | "backups"

/** The five Settings sections — platform configuration only (no accounts, no website content). */
export const SETTINGS_SECTIONS: { slug: SettingsSlug; label: string; description: string; icon: LucideIcon }[] = [
  { slug: "association", label: "إعدادات الجمعية", description: "الاسم الرسمي، الشعار ومعطيات الاتصال", icon: Landmark },
  { slug: "system", label: "إعدادات النظام", description: "المنطقة الزمنية وتنسيق التاريخ", icon: Settings2 },
  { slug: "academic-year", label: "السنة الدراسية", description: "السنة الحالية والسنوات الدراسية وسداسياتها", icon: CalendarRange },
  { slug: "preferences", label: "التفضيلات", description: "العرض الافتراضي للرزنامة وعدد العناصر في الجداول", icon: SlidersHorizontal },
  { slug: "backups", label: "النسخ الاحتياطي", description: "يتوفر بعد ربط المنصة بقاعدة البيانات", icon: DatabaseBackup },
]

const hrefOf = (slug: SettingsSlug) => `/admin/settings/${slug}`

/**
 * Frame of every Settings section: breadcrumbs, title and the section
 * navigation — a side list from `lg`, a compact select below.
 */
export function SettingsShell({
  section,
  description,
  actions,
  children,
}: {
  section: SettingsSlug
  description: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const router = useRouter()
  const current = SETTINGS_SECTIONS.find((s) => s.slug === section)!

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الإعدادات", href: "/admin/settings" }, { label: current.label }]} />
      <PageHeader title={current.label} description={description} actions={actions} />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="أقسام الإعدادات" className="hidden lg:block">
          <ul className="sticky top-20 space-y-1">
            {SETTINGS_SECTIONS.map(({ slug, label, icon: Icon }) => (
              <li key={slug}>
                <Link
                  href={hrefOf(slug)}
                  aria-current={slug === section ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    slug === section ? "bg-brand-soft font-medium text-brand-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="lg:hidden">
          <Select value={section} onValueChange={(slug) => router.push(hrefOf(slug as SettingsSlug))}>
            <SelectTrigger aria-label="أقسام الإعدادات" className="w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {SETTINGS_SECTIONS.map(({ slug, label }) => (
                <SelectItem key={slug} value={slug}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </>
  )
}

/** /admin/settings — entry cards with the current value of each section. */
export function SettingsOverview() {
  const { associationSettings, platformSettings, academicYears } = useOperations()
  const view = CALENDAR_VIEWS.find((v) => v.value === platformSettings.defaultCalendarView)?.label
  const summary: Record<SettingsSlug, string> = {
    association: associationSettings.name,
    system: `${platformSettings.timezone} · ${formatNumericDate(MOCK_TODAY, platformSettings.dateFormat)}`,
    "academic-year": `السنة الحالية: ${getCurrentAcademicYear(academicYears).label}`,
    preferences: `الرزنامة: ${view} · ${platformSettings.defaultPageSize} عناصر في الصفحة`,
    backups: "يتوفر بعد ربط المنصة بقاعدة البيانات",
  }

  return (
    <>
      <PageHeader title="الإعدادات" description="إدارة الإعدادات العامة للجمعية والمنصة." />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_SECTIONS.map(({ slug, label, description, icon: Icon }) => (
          <li key={slug}>
            <Link href={hrefOf(slug)} className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Card className="h-full flex-row items-start gap-4 p-4 transition-colors hover:border-primary/40">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                  <p className="truncate text-xs font-medium text-foreground/80">{summary[slug]}</p>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {/* What Settings is NOT: website content and accounts have their own places */}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Card className="flex-row items-start gap-3 p-4">
          <Globe className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="space-y-1 text-sm">
            <p className="font-medium">إعدادات الموقع العام</p>
            <p className="text-muted-foreground">التعريف بالجمعية، الرسالة، أوقات الاستقبال والشبكات الاجتماعية تُدار من الموقع الإلكتروني.</p>
            <Link href="/admin/website/settings" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              إعدادات الموقع
              <ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden />
            </Link>
          </div>
        </Card>
        <Card className="flex-row items-start gap-3 p-4">
          <UserCog className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1 text-sm">
            <p className="font-medium">إدارة الحسابات</p>
            <p className="text-muted-foreground">
              المستخدمون والأدوار وكلمات المرور ستكون وحدة مستقلة، تُضاف بعد إرساء نظام المصادقة الفعلي على الخادم.
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}
