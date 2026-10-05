"use client"

import { useRef } from "react"

import { ATTENDANCE_STATUSES } from "@/lib/attendance"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AttendanceStatus } from "@/types/domain"

import { ATTENDANCE_STYLE } from "./attendance-badges"

/**
 * One tap per student: four large buttons, the selected one filled.
 * Behaves as a radio group (arrow keys move, Space/Enter select).
 */
export function StatusPicker({
  value,
  onChange,
  label,
  size = "default",
  className,
}: {
  value?: AttendanceStatus
  onChange: (status: AttendanceStatus) => void
  /** Accessible name, e.g. the student's name */
  label: string
  size?: "default" | "compact"
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const dir = getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1
    const step =
      event.key === "ArrowRight" ? dir : event.key === "ArrowLeft" ? -dir : event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + ATTENDANCE_STATUSES.length) % ATTENDANCE_STATUSES.length
    refs.current[next]?.focus()
    onChange(ATTENDANCE_STATUSES[next])
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", size === "compact" && "gap-1.5", className)}
    >
      {ATTENDANCE_STATUSES.map((status, index) => {
        const { icon: Icon, selected, idle } = ATTENDANCE_STYLE[status]
        const checked = value === status
        return (
          <button
            key={status}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            // Roving tab stop: the selected option (or the first) is reachable with Tab
            tabIndex={checked || (!value && index === 0) ? 0 : -1}
            onClick={() => onChange(status)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border bg-background font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]",
              size === "compact" ? "h-9 px-2 text-xs" : "h-11 px-3 text-sm",
              checked ? selected : cn("text-foreground", idle)
            )}
          >
            <Icon className={size === "compact" ? "size-3.5" : "size-4"} aria-hidden />
            {labels.attendance[status]}
          </button>
        )
      })}
    </div>
  )
}
