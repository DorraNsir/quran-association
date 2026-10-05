"use client"

import { useSyncExternalStore } from "react"

import { cn } from "@/lib/utils"

import { CalendarEvent, type CalendarEntry } from "./calendar-event"
import { fromMinutes, layoutLanes, toMinutes } from "./calendar-utils"

const HOUR_PX = 56

export interface GridColumn {
  key: string
  header: React.ReactNode
  /** Highlights the column and draws the current-time line */
  isToday?: boolean
  entries: CalendarEntry[]
  /** Clicking free space schedules a session here, starting at the clicked half hour */
  onEmptyClick?: (start: string) => void
  emptyHint?: string
}

/** Current clock minutes, client-only (null during SSR so markup matches). */
function useNowMinutes() {
  return useSyncExternalStore(
    (notify) => {
      const id = setInterval(notify, 60_000)
      return () => clearInterval(id)
    },
    () => {
      const now = new Date()
      return now.getHours() * 60 + now.getMinutes()
    },
    () => null
  )
}

/**
 * Hour grid shared by the week view (one column per day) and the rooms
 * view (one column per room). Columns follow the document direction, so
 * in Arabic the first column sits on the right next to the hour gutter.
 */
export function TimeGrid({
  columns,
  hours,
  onOpen,
  showBranch,
  minColumnWidth = 7.5,
}: {
  columns: GridColumn[]
  hours: { first: number; last: number }
  onOpen: (entry: CalendarEntry) => void
  showBranch?: boolean
  /** rem — the grid scrolls horizontally below this */
  minColumnWidth?: number
}) {
  const now = useNowMinutes()
  const span = hours.last - hours.first
  const height = span * HOUR_PX
  const gridTemplate = `3.5rem repeat(${columns.length}, minmax(${minColumnWidth}rem, 1fr))`
  const toPx = (minutes: number) => ((minutes - hours.first * 60) / 60) * HOUR_PX

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div style={{ minWidth: `${3.5 + columns.length * minColumnWidth}rem` }}>
        <div
          className="sticky top-0 z-10 grid border-b bg-card"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div aria-hidden />
          {columns.map((col) => (
            <div
              key={col.key}
              className={cn(
                "border-s px-2 py-2 text-center text-sm",
                col.isToday && "bg-brand-soft/60 text-brand-soft-foreground"
              )}
            >
              {col.header}
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="relative" style={{ height }} aria-hidden>
            {Array.from({ length: span }, (_, i) => (
              <span
                key={i}
                className="absolute end-2 -translate-y-1/2 text-[0.7rem] tabular-nums text-muted-foreground first:translate-y-0"
                style={{ top: i * HOUR_PX }}
                dir="ltr"
              >
                {fromMinutes((hours.first + i) * 60)}
              </span>
            ))}
          </div>

          {columns.map((col) => (
            <div
              key={col.key}
              className={cn(
                "relative border-s",
                col.isToday && "bg-brand-soft/20",
                col.onEmptyClick && "cursor-pointer hover:bg-muted/30"
              )}
              style={{
                height,
                backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_PX / 2}px, color-mix(in oklch, var(--border) 45%, transparent) ${HOUR_PX / 2}px ${HOUR_PX / 2 + 1}px, transparent ${HOUR_PX / 2 + 1}px ${HOUR_PX}px)`,
              }}
              title={col.onEmptyClick ? col.emptyHint : undefined}
              onClick={(e) => {
                if (!col.onEmptyClick) return
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top
                const minutes = hours.first * 60 + Math.floor((y / HOUR_PX) * 2) * 30
                col.onEmptyClick(fromMinutes(minutes))
              }}
            >
              {layoutLanes(col.entries.map((entry) => ({ ...entry, start: entry.schedule.start, end: entry.schedule.end }))).map(
                ({ item, lane, lanes }) => {
                  const top = toPx(toMinutes(item.schedule.start))
                  const bottom = toPx(toMinutes(item.schedule.end))
                  return (
                    <CalendarEvent
                      key={item.schedule.id}
                      entry={item}
                      onOpen={onOpen}
                      showBranch={showBranch}
                      className="absolute"
                      style={{
                        top: top + 1,
                        height: Math.max(bottom - top - 2, 22),
                        insetInlineStart: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                      }}
                    />
                  )
                }
              )}
              {col.isToday && now !== null && now >= hours.first * 60 && now <= hours.last * 60 && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-[1] border-t-2 border-destructive/70"
                  style={{ top: toPx(now) }}
                  aria-hidden
                >
                  <span className="absolute -start-1 -top-[5px] size-2 rounded-full bg-destructive" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
