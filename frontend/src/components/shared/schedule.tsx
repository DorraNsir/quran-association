import { CalendarOff } from "lucide-react"
import Link from "next/link"

import { sortSlots } from "@/lib/domain"
import { formatTimeRange } from "@/lib/format"
import { labels, WEEK_ORDER } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ScheduleSlot } from "@/types/domain"

/** Compact one-line-per-slot schedule for tables and cards. */
export function ScheduleSummary<S extends ScheduleSlot>({
  schedule,
  detail,
  className,
}: {
  schedule: S[]
  /** Extra info per row, e.g. the session's room */
  detail?: (slot: S) => React.ReactNode
  className?: string
}) {
  if (schedule.length === 0) {
    return <span className="text-sm text-muted-foreground">لم يُحدَّد بعد</span>
  }
  return (
    <ul className={cn("space-y-0.5 text-sm", className)}>
      {sortSlots(schedule).map((slot) => (
        <li key={`${slot.day}-${slot.start}`} className="flex gap-2 whitespace-nowrap">
          <span className="w-16 text-muted-foreground">{labels.weekday[slot.day]}</span>
          <span dir="ltr" className="tabular-nums">
            {formatTimeRange(slot.start, slot.end)}
          </span>
          {detail && <span className="truncate text-muted-foreground">{detail(slot)}</span>}
        </li>
      ))}
    </ul>
  )
}

export interface ScheduleEntry {
  slot: ScheduleSlot
  title: string
  subtitle?: string
  href?: string
  /** Highlighted entries use the brand color (e.g. supervised groups). */
  emphasis?: boolean
  badge?: React.ReactNode
}

/**
 * Week view: seven columns on large screens, a stacked day list on small
 * screens (only days with sessions are shown there).
 */
export function WeeklyScheduleGrid({
  entries,
  emptyLabel = "لا توجد حصص مبرمجة",
}: {
  entries: ScheduleEntry[]
  emptyLabel?: string
}) {
  const byDay = WEEK_ORDER.map((day) => ({
    day,
    entries: entries
      .filter((e) => e.slot.day === day)
      .sort((a, b) => a.slot.start.localeCompare(b.slot.start)),
  }))

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <CalendarOff className="size-5" aria-hidden />
        {emptyLabel}
      </div>
    )
  }

  return (
    <>
      <div className="hidden grid-cols-7 gap-2 lg:grid">
        {byDay.map(({ day, entries }) => (
          <div key={day} className="flex min-h-32 flex-col gap-2 rounded-lg bg-muted/50 p-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              {labels.weekday[day]}
            </p>
            {entries.map((entry) => (
              <ScheduleBlock key={`${entry.title}-${entry.slot.start}`} entry={entry} />
            ))}
          </div>
        ))}
      </div>
      <ol className="space-y-3 lg:hidden">
        {byDay
          .filter((d) => d.entries.length > 0)
          .map(({ day, entries }) => (
            <li key={day} className="flex gap-3">
              <p className="w-16 shrink-0 pt-2 text-sm font-medium text-muted-foreground">
                {labels.weekday[day]}
              </p>
              <div className="flex flex-1 flex-col gap-2">
                {entries.map((entry) => (
                  <ScheduleBlock key={`${entry.title}-${entry.slot.start}`} entry={entry} />
                ))}
              </div>
            </li>
          ))}
      </ol>
    </>
  )
}

function ScheduleBlock({ entry }: { entry: ScheduleEntry }) {
  const body = (
    <>
      <p className="text-xs tabular-nums text-muted-foreground">
        <span dir="ltr" className="whitespace-nowrap">{formatTimeRange(entry.slot.start, entry.slot.end)}</span>
      </p>
      <p className="text-sm font-medium leading-snug">{entry.title}</p>
      {entry.subtitle && (
        <p className="text-xs leading-snug text-muted-foreground">{entry.subtitle}</p>
      )}
      {entry.badge}
    </>
  )
  const classes = cn(
    "flex flex-col gap-1 rounded-md border bg-card p-2 border-s-2",
    entry.emphasis ? "border-s-primary" : "border-s-muted-foreground/40"
  )
  if (entry.href) {
    return (
      <Link href={entry.href} className={cn(classes, "transition-colors hover:bg-muted")}>
        {body}
      </Link>
    )
  }
  return <div className={classes}>{body}</div>
}
