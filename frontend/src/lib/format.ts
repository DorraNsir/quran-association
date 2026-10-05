import { defaultLocale, locales } from "@/lib/i18n"
import type { ISODate, TimeOfDay } from "@/types/domain"

const intlLocale = locales[defaultLocale].intl

const dateFormatter = new Intl.DateTimeFormat(intlLocale, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const shortDateFormatter = new Intl.DateTimeFormat(intlLocale, {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
})

const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Africa/Tunis",
})

/** "15 سبتمبر 2026" — dates are parsed as UTC so server and client agree. */
export function formatDate(date: ISODate) {
  return dateFormatter.format(new Date(date))
}

const dayNumberFormatter = new Intl.DateTimeFormat(intlLocale, { day: "numeric", timeZone: "UTC" })
const dayMonthFormatter = new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", timeZone: "UTC" })
const weekdayDateFormatter = new Intl.DateTimeFormat(intlLocale, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

/** "5" */
export function formatDayNumber(date: ISODate) {
  return dayNumberFormatter.format(new Date(date))
}

/** "5 أكتوبر" */
export function formatDayMonth(date: ISODate) {
  return dayMonthFormatter.format(new Date(date))
}

/** "الأحد 11 أكتوبر 2026" */
export function formatWeekdayDate(date: ISODate) {
  return weekdayDateFormatter.format(new Date(date))
}

/** "28 سبتمبر – 4 أكتوبر 2026" */
export function formatDateRange(from: ISODate, to: ISODate) {
  return `${formatDayMonth(from)} – ${formatDate(to)}`
}

export function formatShortDate(date: ISODate) {
  return shortDateFormatter.format(new Date(date))
}

export function formatDateTime(isoDateTime: string) {
  return dateTimeFormatter.format(new Date(isoDateTime))
}

/** Tunisian numbers are stored as 8 digits; displayed as "22 345 678". */
export function formatPhone(phone?: string) {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length !== 8) return phone
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`
}

export function formatTimeRange(start: TimeOfDay, end: TimeOfDay) {
  return `${start} – ${end}`
}

export function minutesBetween(start: TimeOfDay, end: TimeOfDay) {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

/** "4 س 30 د" */
export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!minutes) return `${hours} س`
  if (!hours) return `${minutes} د`
  return `${hours} س ${minutes} د`
}

/** Arabic plural agreement for counts (simplified for UI labels). */
export function pluralize(
  count: number,
  forms: { one: string; two: string; few: string; many: string }
) {
  if (count === 0) return `0 ${forms.few}`
  if (count === 1) return forms.one
  if (count === 2) return forms.two
  if (count >= 3 && count <= 10) return `${count} ${forms.few}`
  return `${count} ${forms.many}`
}

export const countLabels = {
  students: (n: number) =>
    pluralize(n, { one: "طالب واحد", two: "طالبان", few: "طلبة", many: "طالبًا" }),
  groups: (n: number) =>
    pluralize(n, { one: "مجموعة واحدة", two: "مجموعتان", few: "مجموعات", many: "مجموعة" }),
  teachers: (n: number) =>
    pluralize(n, { one: "معلم واحد", two: "معلمان", few: "معلمين", many: "معلمًا" }),
  rooms: (n: number) =>
    pluralize(n, { one: "قاعة واحدة", two: "قاعتان", few: "قاعات", many: "قاعة" }),
  classes: (n: number) =>
    pluralize(n, { one: "حلقة واحدة", two: "حلقتان", few: "حلقات", many: "حلقة" }),
  sessions: (n: number) =>
    pluralize(n, { one: "حصة واحدة", two: "حصتان", few: "حصص", many: "حصة" }),
}

/** Time since a date, e.g. "سنتان و3 أشهر" — used for registration seniority. */
export function formatElapsed(from: ISODate, to: ISODate) {
  const a = new Date(from)
  const b = new Date(to)
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  if (b.getUTCDate() < a.getUTCDate()) months--
  if (months < 1) return "أقل من شهر"
  const years = Math.floor(months / 12)
  const rest = months % 12
  const y = years === 0 ? "" : years === 1 ? "سنة" : years === 2 ? "سنتان" : years <= 10 ? `${years} سنوات` : `${years} سنة`
  const m = rest === 0 ? "" : rest === 1 ? "شهر" : rest === 2 ? "شهران" : `${rest} أشهر`
  return [y, m].filter(Boolean).join(" و")
}
