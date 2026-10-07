"use client"

import { DatabaseBackup, ImagePlus, Info, Languages, RotateCcw } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import { toast } from "sonner"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { FormField, FormSection } from "@/components/shared/form"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, formatNumericDate } from "@/lib/format"
import { MOCK_TODAY } from "@/lib/mock/reference-date"
import {
  associationSettingsErrors,
  CALENDAR_VIEWS,
  DATE_FORMATS,
  isSupportedPlatformSettings,
  PAGE_SIZES,
  SUPPORTED_TIMEZONES,
} from "@/lib/platform-settings"
import { operations, useOperations } from "@/lib/store/operations"
import { normalizePhone, PHONE_HINT } from "@/lib/validation"
import type { CalendarDefaultView, DateFormat, TablePageSize } from "@/types/domain"

import logoMark from "../../../public/brand/logo-mark.png"
import { SettingsShell } from "./settings-shell"

/** Prototype wording: changes live in this browser session until the API exists. */
const SESSION_NOTE = "طُبّقت التغييرات مباشرة في المنصة (نسخة تجريبية: تُحفظ في هذه الجلسة إلى حين ربط الخادم)."

/** Save / discard bar: Save stays disabled until something changed. */
function SaveBar({ dirty, onReset }: { dirty: boolean; onReset: () => void }) {
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
      <p className="me-auto text-xs text-muted-foreground" aria-live="polite">
        {dirty ? "لديك تغييرات غير محفوظة" : "لا توجد تغييرات"}
      </p>
      <Button type="button" variant="outline" disabled={!dirty} onClick={onReset}>
        <RotateCcw />
        تراجع
      </Button>
      <Button type="submit" disabled={!dirty} className="min-w-28">
        حفظ التغييرات
      </Button>
    </div>
  )
}

/* ---------------- Association identity ---------------- */

export function AssociationSettingsForm() {
  const { associationSettings: saved } = useOperations()
  const initial = { name: saved.name, phone: saved.phone ?? "", email: saved.email ?? "", address: saved.address ?? "", logoUrl: saved.logoUrl }
  const [values, setValues] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const [logoError, setLogoError] = useState<string>()
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((v) => ({ ...v, [key]: value }))
  const errors = associationSettingsErrors(values)
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)

  return (
    <SettingsShell section="association" description={`الهوية الرسمية للجمعية، تُستعمل في كل الفضاءات وفي الموقع العام. آخر تحديث: ${formatDate(saved.updatedAt)}`}>
      <form
        noValidate
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
          if (Object.values(errors).some(Boolean)) return
          const patch = {
            name: values.name.trim(),
            phone: values.phone.trim() ? normalizePhone(values.phone) : undefined,
            email: values.email.trim() || undefined,
            address: values.address.trim() || undefined,
            logoUrl: values.logoUrl,
          }
          operations.updateAssociationSettings(patch, MOCK_TODAY)
          // Show exactly what was stored (normalized), so the form is clean again
          setValues({ ...patch, phone: patch.phone ?? "", email: patch.email ?? "", address: patch.address ?? "" })
          setSubmitted(false)
          toast.success("تم حفظ إعدادات الجمعية", { description: SESSION_NOTE })
        }}
      >
        <Card className="p-5 sm:p-6">
          <FormSection title="الهوية" description="الاسم الرسمي والشعار كما يظهران في القائمة الجانبية لكل الفضاءات وفي الموقع العام.">
            <FormField id="assoc-name" label="الاسم الرسمي للجمعية" required error={shown("name")} className="sm:col-span-2">
              <Input id="assoc-name" value={values.name} maxLength={120} onChange={(e) => set("name", e.target.value)} aria-invalid={!!shown("name") || undefined} />
            </FormField>
            <FormField id="assoc-logo" label="الشعار الرسمي" optional error={logoError}
              description="معاينة مؤقتة في هذه الجلسة — يُرفع الملف فعليًا عند ربط المنصة بالخادم. يُفضّل شعار مربّع بخلفية شفافة."
              className="sm:col-span-2">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-24 shrink-0 items-center justify-center rounded-xl border bg-muted/40 p-2">
                  {values.logoUrl ? (
                    <Image src={values.logoUrl} alt="معاينة الشعار" width={96} height={96} unoptimized className="max-h-full w-auto object-contain" />
                  ) : (
                    <Image src={logoMark} alt="الشعار الحالي" className="max-h-full w-auto" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild type="button" variant="outline" size="sm">
                    <label htmlFor="assoc-logo" className="cursor-pointer">
                      <ImagePlus />
                      تغيير الشعار
                    </label>
                  </Button>
                  {values.logoUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => set("logoUrl", undefined)}>
                      استعادة الشعار الافتراضي
                    </Button>
                  )}
                </div>
                <input
                  id="assoc-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (!file) return
                    if (!file.type.startsWith("image/")) return setLogoError("اختر ملف صورة (PNG أو JPG أو SVG أو WebP)")
                    if (file.size > 2 * 1024 * 1024) return setLogoError("حجم الشعار يجب ألا يتجاوز 2 م.ب")
                    setLogoError(undefined)
                    // Transient preview URL — no upload, no base64 in state
                    set("logoUrl", URL.createObjectURL(file))
                  }}
                />
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
              <Textarea id="assoc-address" rows={2} maxLength={200} value={values.address} onChange={(e) => set("address", e.target.value)} />
            </FormField>
          </FormSection>
        </Card>

        <SaveBar dirty={dirty} onReset={() => { setValues(initial); setSubmitted(false); setLogoError(undefined) }} />
      </form>
    </SettingsShell>
  )
}

/* ---------------- System ---------------- */

export function SystemSettingsForm() {
  const { platformSettings: saved } = useOperations()
  const initial = { timezone: saved.timezone, dateFormat: saved.dateFormat }
  const [values, setValues] = useState(initial)
  const dirty = values.timezone !== initial.timezone || values.dateFormat !== initial.dateFormat

  return (
    <SettingsShell section="system" description="إعدادات تشغيل المنصة: التوقيت المعتمد وطريقة عرض التواريخ في الجداول الإدارية.">
      <form
        noValidate
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (!isSupportedPlatformSettings(values)) return toast.error("قيمة غير مدعومة")
          operations.updatePlatformSettings(values, MOCK_TODAY)
          toast.success("تم حفظ إعدادات النظام", { description: SESSION_NOTE })
        }}
      >
        <Card className="p-5 sm:p-6">
          <FormSection title="المنطقة الزمنية" className="sm:grid-cols-1">
            <FormField id="sys-timezone" label="المنطقة الزمنية" required
              description="مرجع توقيت الحصص والرزنامة والفعاليات والمدفوعات وتواريخ النشر. سيعتمدها الخادم عند ربط قاعدة البيانات.">
              <Select value={values.timezone} onValueChange={(timezone) => setValues((v) => ({ ...v, timezone }))}>
                <SelectTrigger id="sys-timezone" className="w-full sm:w-96"><SelectValue /></SelectTrigger>
                <SelectContent position="popper">
                  {SUPPORTED_TIMEZONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </FormSection>
        </Card>

        <Card className="p-5 sm:p-6">
          <FormSection title="تنسيق التاريخ" description="يُطبَّق على أعمدة التواريخ في الجداول الإدارية. لا تتغير التواريخ المسجّلة، بل طريقة عرضها فقط." className="sm:grid-cols-1">
            <ChoiceGroup
              label="تنسيق التاريخ"
              value={values.dateFormat}
              onChange={(dateFormat: DateFormat) => setValues((v) => ({ ...v, dateFormat }))}
              choices={DATE_FORMATS.map((f) => ({ value: f.value, label: f.label, description: `مثال: ${formatNumericDate(MOCK_TODAY, f.value)}` }))}
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

        <SaveBar dirty={dirty} onReset={() => setValues(initial)} />
      </form>
    </SettingsShell>
  )
}

/* ---------------- Preferences ---------------- */

export function PreferencesForm() {
  const { platformSettings: saved } = useOperations()
  const initial = { defaultCalendarView: saved.defaultCalendarView, defaultPageSize: saved.defaultPageSize }
  const [values, setValues] = useState(initial)
  const dirty = values.defaultCalendarView !== initial.defaultCalendarView || values.defaultPageSize !== initial.defaultPageSize

  return (
    <SettingsShell section="preferences" description="خيارات عرض بسيطة تنطبق على المنصة كلها.">
      <form
        noValidate
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          operations.updatePlatformSettings(values, MOCK_TODAY)
          toast.success("تم حفظ التفضيلات", { description: SESSION_NOTE })
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
              onChange={(size) => setValues((v) => ({ ...v, defaultPageSize: Number(size) as TablePageSize }))}
              className="grid-cols-3 sm:grid-cols-3"
              choices={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} عنصرًا` }))}
            />
          </FormSection>
        </Card>

        <SaveBar dirty={dirty} onReset={() => setValues(initial)} />
      </form>
    </SettingsShell>
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
        <p className="font-semibold">ستتوفر إدارة النسخ الاحتياطية بعد ربط المنصة بقاعدة البيانات.</p>
        <p className="max-w-lg text-sm text-muted-foreground">
          تعمل المنصة حاليًا ببيانات تجريبية داخل المتصفح، ولا تُحفظ أي بيانات على خادم بعد؛ لذلك لا توجد نسخ احتياطية لعرضها أو استرجاعها.
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
