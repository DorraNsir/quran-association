/**
 * Arabic date, number and bidirectional-text formatting — the ONE place the
 * mobile app turns API values into display text.
 *
 * Dates: the API sends calendar dates (YYYY-MM-DD) already in the platform
 * timezone (Africa/Tunis); "today" comes from platformClock(). These helpers
 * never apply the phone's timezone: a date string is read as a calendar day.
 *
 * Month and weekday names are a fixed table equal to what the web app prints
 * with Intl 'ar-TN-u-nu-latn' (Tunisian month names, Latin digits), so the
 * output does not depend on the phone's ICU data.
 */

export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

const MONTHS = [
  'جانفي',
  'فيفري',
  'مارس',
  'أفريل',
  'ماي',
  'جوان',
  'جويلية',
  'أوت',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  MON: 'الاثنين',
  TUE: 'الثلاثاء',
  WED: 'الأربعاء',
  THU: 'الخميس',
  FRI: 'الجمعة',
  SAT: 'السبت',
  SUN: 'الأحد',
};

const WEEKDAY_FROM_INDEX: readonly Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface CalendarDay {
  year: number;
  month: number; // 1–12
  day: number;
}

/** "2026-11-16" (or an ISO date-time; only the date part is read). */
function parseDay(date: string): CalendarDay {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) throw new RangeError(`Not a calendar date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Weekday of a calendar date (computed in UTC: no timezone shift). */
export function weekdayOf(date: string): Weekday {
  const { year, month, day } = parseDay(date);
  return WEEKDAY_FROM_INDEX[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;
}

/** 16 — the day of the month. */
export function dayOfMonth(date: string): number {
  return parseDay(date).day;
}

/** "نوفمبر", or "نوفمبر 2027" with the year. */
export function formatMonth(date: string, withYear = false): string {
  const { year, month } = parseDay(date);
  return withYear ? `${MONTHS[month - 1]} ${year}` : MONTHS[month - 1]!;
}

/** "16 نوفمبر" */
export function formatDayMonth(date: string): string {
  const { month, day } = parseDay(date);
  return `${day} ${MONTHS[month - 1]}`;
}

/** "16 نوفمبر 2026" */
export function formatDate(date: string): string {
  const { year } = parseDay(date);
  return `${formatDayMonth(date)} ${year}`;
}

/** "الاثنين 16 نوفمبر 2026" — headers and full-width lines. */
export function formatDateLong(date: string): string {
  return `${WEEKDAY_NAMES[weekdayOf(date)]} ${formatDate(date)}`;
}

/** "الاثنين، 16 نوفمبر" — compact cards (the year is implied). */
export function formatDateCompact(date: string): string {
  return `${WEEKDAY_NAMES[weekdayOf(date)]}، ${formatDayMonth(date)}`;
}

/** Same calendar year as `reference` (to drop a redundant year in compact UI). */
export function sameYear(date: string, reference: string): boolean {
  return parseDay(date).year === parseDay(reference).year;
}

/* --------------------------------- bidi --------------------------------- */

/** Unicode isolates: LTR content (years, ratios, %) embedded in Arabic text. */
const LRI = '⁦';
const PDI = '⁩';

/**
 * Wraps left-to-right content (e.g. "2026-2027", "80%") so the Arabic
 * paragraph around it can never reorder its characters or its neighbours.
 */
export function ltr(text: string | number): string {
  return `${LRI}${text}${PDI}`;
}

/** "80%" (whole percent, as the web), isolated as LTR; null → "—". */
export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : ltr(`${Math.round(rate)}%`);
}

/** "8 من 10" — a count over a total in words, no ambiguous slash in RTL. */
export function formatCountOf(count: number, total: number): string {
  return `${count} من ${total}`;
}
