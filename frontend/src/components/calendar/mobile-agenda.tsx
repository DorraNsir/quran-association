"use client"

import { CalendarX2, DoorOpen, Plus, ShieldCheck } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { fullName } from "@/lib/domain"
import { weekDates, weekdayOf } from "@/lib/dates"
import { countLabels, formatDate, formatDayNumber } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ISODate } from "@/types/domain"

import { toneOf, type CalendarEntry } from "./calendar-event"

/** Phone layout: pick a day of the week, then read that day as a list. */
export function MobileAgenda({
  date,
  today,
  entriesByDay,
  onSelectDate,
  onOpen,
  onCreate,
}: {
  date: ISODate
  today: ISODate
  entriesByDay: (date: ISODate) => CalendarEntry[]
  onSelectDate: (date: ISODate) => void
  onOpen: (entry: CalendarEntry) => void
  onCreate: () => void
}) {
  const entries = entriesByDay(date)

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="أيام الأسبوع" className="grid grid-cols-7 gap-1">
        {weekDates(date).map(({ weekday, date: d }) => {
          const count = entriesByDay(d).length
          const selected = d === date
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`${labels.weekday[weekday]} ${formatDate(d)}، ${countLabels.sessions(count)}`}
              onClick={() => onSelectDate(d)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border py-2 text-xs transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                !selected && d === today && "border-primary/50 text-primary"
              )}
            >
              <span>{labels.weekdayShort[weekday]}</span>
              <span className="text-base font-semibold tabular-nums">{formatDayNumber(d)}</span>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  count === 0 ? "bg-transparent" : selected ? "bg-primary-foreground" : "bg-primary"
                )}
              />
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {labels.weekday[weekdayOf(date)]} {formatDate(date)}
          {date === today && <span className="ms-2 text-xs text-primary">اليوم</span>}
        </p>
        <span className="text-xs text-muted-foreground">{countLabels.sessions(entries.length)}</span>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={CalendarX2}
            title="لا توجد حصص في هذا اليوم"
            action={
              <Button size="sm" variant="outline" onClick={onCreate}>
                <Plus />
                برمجة حصة
              </Button>
            }
          />
        </div>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.schedule.id}>
              <button
                type="button"
                onClick={() => onOpen(entry)}
                className="flex w-full gap-3 rounded-xl border bg-card p-3 text-start transition-colors hover:bg-muted/50"
              >
                <div className="w-14 shrink-0 tabular-nums">
                  <p className="text-base font-semibold">{entry.schedule.start}</p>
                  <p className="text-xs text-muted-foreground">{entry.schedule.end}</p>
                </div>
                <span aria-hidden className={cn("w-1 shrink-0 rounded-full", toneOf(entry.tone).dot)} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">{entry.group.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <DoorOpen className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      {entry.room?.name} · {entry.branch?.name}
                    </span>
                  </p>
                  {entry.supervisor && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                      {fullName(entry.supervisor)}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
