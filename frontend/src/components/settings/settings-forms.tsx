"use client"

import { DatabaseBackup, ImagePlus, Info, Languages, Loader2, Lock, RotateCcw } from "lucide-react"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { FormField, FormSection } from "@/components/shared/form"
import { QueryState } from "@/components/shared/query-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api/errors"
import { uploadLogo, useAdminSettings, useUpdateSettings, type AdminSettingsDto } from "@/lib/api/hooks/settings"
import { usePrivateFileUrl } from "@/lib/api/private-file"
import { formatDate, formatNumericDate } from "@/lib/format"
import { todayInTunis, tunisDateOf } from "@/lib/dates"
import { associationSettingsErrors, CALENDAR_VIEWS, DATE_FORMATS, PAGE_SIZES, SUPPORTED_TIMEZONES } from "@/lib/platform-settings"
import { normalizePhone, PHONE_HINT } from "@/lib/validation"
import type { CalendarDefaultView, DateFormat, TablePageSize } from "@/types/domain"

import logoMark from "../../../public/brand/logo-mark.png"
import { SettingsShell } from "./settings-shell"

/** Save / discard bar: Save stays disabled until something changed (and while saving). */
function SaveBar({ dirty, pending, error, onReset }: { dirty: boolean; pending: boolean; error?: string | null; onReset: () => void }) {
  return (
    <div className="sticky bottom-3 z-10 space-y-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="me-auto text-xs text-muted-foreground" aria-live="polite">
          {pending ? "جارٍ الحفظ…" : dirty ? "لديك تغييرات غير محفوظة" : "لا توجد تغييرات"}
        </p>
        <Button type="button" variant="outline" disabled={!dirty || pending} onClick={onReset}>
          <RotateCcw />
          تراجع
        </Button>
        <Button type="submit" disabled={!dirty || pending} className="min-w-28">
          {pending && <Loader2 className="animate-spin" />}
          حفظ التغييرات
        </Button>
      </div>
    </div>
  )
}

/** Loads the settings once for a section; the form remounts after each save (fresh initial values). */
function WithSettings({ section, description, children }: {
  section: "association" | "system" | "preferences"
  description: string
  children: (settings: AdminSettingsDto) => React.ReactNode
}) {
  const query = useAdminSettings()
  return (
    <SettingsShell section={section} description={description}>
      <QueryState query={query}>{query.data ? children(query.data) : null}</QueryState>
    </SettingsShell>
  )
}

const DATE_FORMAT_TO_API = { "DD/MM/YYYY": "DD_MM_YYYY", "YYYY-MM-DD": "YYYY_MM_DD" } as const
const VIEW_TO_API = { week: "WEEK", rooms: "ROOMS" } as const
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"]

/* ---------------- Association identity ---------------- */

export function AssociationSettingsForm() {
  return (
    <WithSettings section="association" description="الهوية الرسمية للجمعية، تُستعمل في كل الفضاءات وفي الموقع العام.">
      {(settings) => <AssociationForm key={settings.association?.updatedAt ?? "new"} settings={settings} />}
    </WithSettings>
  )
}

type LogoChange = { kind: "keep" } | { kind: "default" } | { kind: "new"; file: File }

function AssociationForm({ settings }: { settings: AdminSettingsDto }) {
  const saved = settings.association
  const update = useUpdateSettings()
  const initial = { name: saved?.name ?? "", phone: saved?.phone ?? "", email: saved?.email ?? "", address: saved?.address ?? "" }
  const [values, setValues] = useState(initial)
  const [logo, setLogo] = useState<LogoChange>({ kind: "keep" })
  const [progress, setProgress] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [logoError, setLogoError] = useState<string>()
  const [saveError, setSaveError] = useState<string | null>(null)
  const current = usePrivateFileUrl(saved?.logoUrl)
  const preview = useMemo(() => (logo.kind === "new" ? URL.createObjectURL(logo.file) : null), [logo])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((v) => ({ ...v, [key]: value }))
  const errors = associationSettingsErrors(values)
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial) || logo.kind !== "keep"
  const pending = update.isPending || progress !== null
  const shownLogo = logo.kind === "new" ? preview : logo.kind === "default" ? null : current.src
  const hasCustomLogo = logo.kind === "new" || (logo.kind === "keep" && !!saved?.logoFileId)

  async function save() {
    let logoFileId: string | null | undefined
    if (logo.kind === "new") {
      setProgress(0)
      try {
        logoFileId = await uploadLogo(logo.file, setProgress)
      } finally {
        setProgress(null)
      }
    } else if (logo.kind === "default") logoFileId = null
    await update.mutateAsync({
      association: {
        name: values.name.trim(),
        phone: values.phone.trim() ? normalizePhone(values.phone) : null,
        email: values.email.trim() || null,
        address: values.address.trim() || null,
        ...(logoFileId !== undefined && { logoFileId }),
      },
    })
    toast.success("تم حفظ إعدادات الجمعية")
  }

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (pending) return
        setSubmitted(true)
        if (Object.values(errors).some(Boolean)) return
        setSaveError(null)
        save().catch((error: unknown) => setSaveError(errorMessage(error)))
      }}
    >
      {saved && <p className="text-xs text-muted-foreground">آخر تحديث: {formatDate(tunisDateOf(saved.updatedAt))}</p>}
      <Card className="p-5 sm:p-6">
        <FormSection title="الهوية" description="الاسم الرسمي والشعار كما يظهران في القائمة الجانبية لكل الفضاءات وفي الموقع العام.">
          <FormField id="assoc-name" label="الاسم الرسمي للجمعية" required error={shown("name")} className="sm:col-span-2">
            <Input id="assoc-name" value={values.name} maxLength={150} onChange={(e) => set("name", e.target.value)} aria-invalid={!!shown("name") || undefined} />
          </FormField>
          <FormField id="assoc-logo" label="الشعار الرسمي" optional error={logoError}
            description="PNG أو JPG أو WebP، حتى 5 م.ب. يُفضّل شعار مربّع بخلفية شفافة."
            className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex size-24 shrink-0 items-center justify-center rounded-xl border bg-muted/40 p-2">
                {shownLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- object URL of a private/local file
                  <img src={shownLogo} alt="معاينة الشعار" className="max-h-full w-auto object-contain" />
                ) : hasCustomLogo ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="جارٍ تحميل الشعار" />
                ) : (
                  <Image src={logoMark} alt="الشعار الافتراضي" className="max-h-full w-auto" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild type="button" variant="outline" size="sm" disabled={pending}>
                  <label htmlFor="assoc-logo" className="cursor-pointer">
                    <ImagePlus />
                    تغيير الشعار
                  </label>
                </Button>
                {hasCustomLogo && (
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setLogo({ kind: "default" })}>
                    استعادة الشعار الافتراضي
                  </Button>
                )}
              </div>
              <input
                id="assoc-logo"
                type="file"
                accept={LOGO_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (!file) return
                  if (!LOGO_TYPES.includes(file.type)) return setLogoError("اختر ملف صورة (PNG أو JPG أو WebP)")
                  if (file.size > 5 * 1024 * 1024) return setLogoError("حجم الشعار يجب ألا يتجاوز 5 م.ب")
                  setLogoError(undefined)
                  setLogo({ kind: "new", file })
                }}
              />
              {progress !== null && <p className="text-xs text-muted-foreground" aria-live="polite">جارٍ رفع الشعار… {progress}%</p>}
            </div>
          </FormField>
        </FormSection>
      </Card>

      <Card className="p-5 sm:p-6">
        <FormSection title="معطيات الاتصال" description="تظهر في تذييل الموقع وصفحة «تواصل معنا».">
          <FormField id="assoc-phone" label="الهاتف الرئيسي" optional error={shown("phone")} description={PHONE_HINT}>
            <Input id="assoc-phone" type="tel" inputMode="tel" dir="ltr" value={values.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={!!shown("phone") || undefined} />
          </FormField>
          <FormField id="assoc-email" label="البريد الإلكتروني" optional error={shown("email")}>
            <Input id="assoc-email" type="email" dir="ltr" value={values.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!shown("email") || undefined} />
          </FormField>
          <FormField id="assoc-address" label="العنوان الرئيسي" optional className="sm:col-span-2">
            <Textarea id="assoc-address" rows={2} maxLength={300} value={values.address} onChange={(e) => set("address", e.target.value)} />
          </FormField>
        </FormSection>
      </Card>

      <SaveBar
        dirty={dirty}
        pending={pending}
        error={saveError}
        onReset={() => {
          setValues(initial)
          setLogo({ kind: "keep" })
          setSubmitted(false)
          setLogoError(undefined)
        }}
      />
    </form>
  )
}

/* ---------------- System ---------------- */

export function SystemSettingsForm() {
  return (
    <WithSettings section="system" description="إعدادات تشغيل المنصة: التوقيت المعتمد وطريقة عرض التواريخ في الجداول الإدارية.">
      {(settings) => <SystemForm key={settings.platform?.updatedAt ?? "new"} settings={settings} />}
    </WithSettings>
  )
}

function SystemForm({ settings }: { settings: AdminSettingsDto }) {
  const update = useUpdateSettings()
  const timezone = settings.platform?.timezone ?? "Africa/Tunis"
  const initial: DateFormat = settings.platform?.dateFormat === "YYYY_MM_DD" ? "YYYY-MM-DD" : "DD/MM/YYYY"
  const [dateFormat, setDateFormat] = useState<DateFormat>(initial)
  const today = todayInTunis()
  const zoneLabel = SUPPORTED_TIMEZONES.find((t) => t.value === timezone)?.label ?? timezone

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (update.isPending) return
        // mutateAsync: the form remounts with the saved values before mutate()'s own callbacks would run
        update
          .mutateAsync({ platform: { dateFormat: DATE_FORMAT_TO_API[dateFormat] } })
          .then(() => toast.success("تم حفظ إعدادات النظام"))
          .catch(() => {})
      }}
    >
      <Card className="p-5 sm:p-6">
        <FormSection title="المنطقة الزمنية" className="sm:grid-cols-1">
          <FormField id="sys-timezone" label="المنطقة الزمنية"
            description="مرجع توقيت الحصص والرزنامة والفعاليات والمدفوعات وتواريخ النشر. قيمة ثابتة يعتمدها الخادم ولا يمكن تعديلها.">
            <div id="sys-timezone" className="flex w-full items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm sm:w-96">
              <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {zoneLabel}
            </div>
          </FormField>
        </FormSection>
      </Card>

      <Card className="p-5 sm:p-6">
        <FormSection title="تنسيق التاريخ" description="يُطبَّق على أعمدة التواريخ في الجداول الإدارية. لا تتغير التواريخ المسجّلة، بل طريقة عرضها فقط." className="sm:grid-cols-1">
          <ChoiceGroup
            label="تنسيق التاريخ"
            value={dateFormat}
            onChange={(next: DateFormat) => setDateFormat(next)}
            choices={DATE_FORMATS.map((f) => ({ value: f.value, label: f.label, description: `مثال: ${formatNumericDate(today, f.value)}` }))}
          />
        </FormSection>
      </Card>

      <Card className="flex-row items-start gap-3 p-4">
        <Languages className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">لغة الواجهة واتجاهها</p>
          <p className="text-muted-foreground">العربية، من اليمين إلى اليسار — لكل الفضاءات والموقع العام.</p>
        </div>
      </Card>

      <SaveBar dirty={dateFormat !== initial} pending={update.isPending} error={update.isError ? errorMessage(update.error) : null}
        onReset={() => setDateFormat(initial)} />
    </form>
  )
}

/* ---------------- Preferences ---------------- */

export function PreferencesForm() {
  return (
    <WithSettings section="preferences" description="خيارات عرض بسيطة تنطبق على المنصة كلها.">
      {(settings) => <PreferencesFields key={settings.platform?.updatedAt ?? "new"} settings={settings} />}
    </WithSettings>
  )
}

function PreferencesFields({ settings }: { settings: AdminSettingsDto }) {
  const update = useUpdateSettings()
  const size = settings.platform?.defaultPageSize
  const initial = {
    defaultCalendarView: (settings.platform?.defaultCalendarView === "ROOMS" ? "rooms" : "week") as CalendarDefaultView,
    defaultPageSize: (size === 20 || size === 50 ? size : 10) as TablePageSize,
  }
  const [values, setValues] = useState(initial)
  const dirty = values.defaultCalendarView !== initial.defaultCalendarView || values.defaultPageSize !== initial.defaultPageSize

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (update.isPending) return
        update
          .mutateAsync({ platform: { defaultCalendarView: VIEW_TO_API[values.defaultCalendarView], defaultPageSize: values.defaultPageSize } })
          .then(() => toast.success("تم حفظ التفضيلات"))
          .catch(() => {})
      }}
    >
      <Card className="p-5 sm:p-6">
        <FormSection title="العرض الافتراضي للرزنامة" description="العرض الذي تُفتح به الرزنامة على الحاسوب؛ يبقى التبديل بين العرضين متاحًا." className="sm:grid-cols-1">
          <ChoiceGroup
            label="العرض الافتراضي للرزنامة"
            value={values.defaultCalendarView}
            onChange={(defaultCalendarView: CalendarDefaultView) => setValues((v) => ({ ...v, defaultCalendarView }))}
            choices={CALENDAR_VIEWS}
          />
        </FormSection>
      </Card>

      <Card className="p-5 sm:p-6">
        <FormSection title="عدد العناصر في الصفحة" description="عدد الأسطر في كل صفحة من جداول المنصة (الطلبة، الحصص، المدفوعات…)." className="sm:grid-cols-1">
          <ChoiceGroup
            label="عدد العناصر في الصفحة"
            value={String(values.defaultPageSize)}
            onChange={(next) => setValues((v) => ({ ...v, defaultPageSize: Number(next) as TablePageSize }))}
            className="grid-cols-3 sm:grid-cols-3"
            choices={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} عنصرًا` }))}
          />
        </FormSection>
      </Card>

      <SaveBar dirty={dirty} pending={update.isPending} error={update.isError ? errorMessage(update.error) : null}
        onReset={() => setValues(initial)} />
    </form>
  )
}

/* ---------------- Backups (information only) ---------------- */

const FUTURE_BACKUPS = [
  "نسخ احتياطي تلقائي ومجدول لقاعدة البيانات",
  "تاريخ آخر نسخة احتياطية وحالتها",
  "سياسة الاحتفاظ بالنسخ",
  "استرجاع نسخة عند الحاجة، بإجراء مؤمَّن",
  "حفظ النسخ في تخزين خارجي آمن",
]

/** No backup exists yet — this page says so plainly (no fake dates, files or restore). */
export function BackupsInfo() {
  return (
    <SettingsShell section="backups" description="حماية بيانات الجمعية بنسخ احتياطية منتظمة.">
      <Card className="items-center gap-3 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
          <DatabaseBackup className="size-6" aria-hidden />
        </span>
        <p className="font-semibold">إدارة النسخ الاحتياطية غير متوفرة في المنصة حاليًا.</p>
        <p className="max-w-lg text-sm text-muted-foreground">
          لم تُضف إدارة النسخ الاحتياطية إلى المنصة بعد؛ لذلك لا توجد نسخ احتياطية لعرضها أو استرجاعها من هنا.
        </p>
      </Card>
      <Card className="gap-3 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Info className="size-4 text-primary" aria-hidden />
          ما سيتوفر في هذا القسم لاحقًا
        </p>
        <ul className="list-disc space-y-1.5 ps-5 text-sm text-muted-foreground">
          {FUTURE_BACKUPS.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Card>
    </SettingsShell>
  )
}
