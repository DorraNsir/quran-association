import { WEEK_ORDER } from "@/lib/i18n"
import type { ISODate, Weekday } from "@/types/domain"

/**
 * Date arithmetic on ISO "YYYY-MM-DD" strings, in UTC so the server and
 * the browser always agree. Display formatting lives in lib/format.
 */
const asDate = (date: ISODate) => new Date(`${date}T00:00:00Z`)

export function addDays(date: ISODate, days: number): ISODate {
  const d = asDate(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const JS_DAY_TO_WEEKDAY: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

export function weekdayOf(date: ISODate): Weekday {
  return JS_DAY_TO_WEEKDAY[asDate(date).getUTCDay()]
}

/** Weeks start on Monday, as in Tunisia. */
export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, -((asDate(date).getUTCDay() + 6) % 7))
}

export function weekDates(date: ISODate) {
  const start = startOfWeek(date)
  return WEEK_ORDER.map((weekday, i) => ({ weekday, date: addDays(start, i) }))
}

export function dateOfWeekday(date: ISODate, weekday: Weekday) {
  return addDays(startOfWeek(date), WEEK_ORDER.indexOf(weekday))
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: ISODate, to: ISODate): ISODate[] {
  const dates: ISODate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d)
  return dates
}

export function isWithin(date: ISODate, range: { from?: ISODate; to?: ISODate }) {
  return (!range.from || date >= range.from) && (!range.to || date <= range.to)
}

/** The platform's calendar (read-only setting on the API). */
export const PLATFORM_TIMEZONE = "Africa/Tunis"

/**
 * Calendar day ("YYYY-MM-DD") of an instant in Africa/Tunis. Calendar-only
 * values from the API (DATE columns) are already "YYYY-MM-DD" and must NOT
 * go through this (no UTC conversion → no off-by-one day).
 */
export function tunisDateOf(instant: Date | string | number): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLATFORM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant))
}

/** Today in Africa/Tunis (whatever the browser's own zone). */
export const todayInTunis = (): ISODate => tunisDateOf(Date.now())

/** "HH:mm" of an instant in Africa/Tunis. */
export function tunisTimeOf(instant: Date | string | number) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PLATFORM_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant))
}
