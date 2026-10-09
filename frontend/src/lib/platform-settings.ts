import { phoneError } from "@/lib/validation"
import type { AssociationSettings, CalendarDefaultView, DateFormat, PlatformSettings, TablePageSize } from "@/types/domain"

/** Supported values — anything else is rejected (the server will enforce the same list in Part 10). */
export const SUPPORTED_TIMEZONES = [{ value: "Africa/Tunis", label: "توقيت تونس (Africa/Tunis) — UTC+01:00" }] as const

export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: "DD/MM/YYYY", label: "يوم/شهر/سنة" },
  { value: "YYYY-MM-DD", label: "سنة-شهر-يوم" },
]

/** Only the views the calendar already has. */
export const CALENDAR_VIEWS: { value: CalendarDefaultView; label: string; description: string }[] = [
  { value: "week", label: "الأسبوع", description: "البرنامج الأسبوعي لكل الأقسام" },
  { value: "rooms", label: "القاعات", description: "يوم واحد موزّعًا على قاعات الفرع" },
]

export const PAGE_SIZES: TablePageSize[] = [10, 20, 50]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Field errors (Arabic) for the association identity form. */
export function associationSettingsErrors(values: Pick<AssociationSettings, "name" | "phone" | "email" | "address">) {
  return {
    name: !values.name?.trim() ? "اسم الجمعية مطلوب" : values.name.trim().length < 3 ? "اسم الجمعية قصير جدًا" : undefined,
    phone: phoneError(values.phone ?? "", { required: false }),
    email: values.email?.trim() && !EMAIL.test(values.email.trim()) ? "بريد إلكتروني غير صالح" : undefined,
  }
}

export function isSupportedPlatformSettings(settings: Pick<PlatformSettings, "timezone" | "dateFormat">) {
  return (
    SUPPORTED_TIMEZONES.some((t) => t.value === settings.timezone) && DATE_FORMATS.some((f) => f.value === settings.dateFormat)
  )
}
