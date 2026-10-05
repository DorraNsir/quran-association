"use client"

import { DoorOpen, ShieldCheck, Users } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fullName } from "@/lib/domain"
import { countLabels, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Branch, Group, Room, Session, Teacher, WeeklySchedule } from "@/types/domain"

import { toMinutes } from "./calendar-utils"

/** A session with everything needed to display it, resolved once by the calendar. */
export interface CalendarEntry {
  schedule: WeeklySchedule
  group: Group
  branch?: Branch
  room?: Room
  supervisor?: Teacher
  assistants: Teacher[]
  studentCount: number
  tone: number
  /** The dated session for the displayed date, when one exists (Part 3) */
  occurrence?: Session
}

/** Restrained per-branch accents (border + soft background), brand green first. */
export const BRANCH_TONES = [
  { block: "border-s-primary bg-brand-soft hover:bg-brand-soft/70", dot: "bg-primary" },
  { block: "border-s-sky-600 bg-sky-50 hover:bg-sky-100/70", dot: "bg-sky-600" },
  { block: "border-s-amber-500 bg-amber-50 hover:bg-amber-100/70", dot: "bg-amber-500" },
  { block: "border-s-slate-500 bg-slate-100 hover:bg-slate-200/60", dot: "bg-slate-500" },
]

/** "مجموعة الفرقان" → "الفرقان": the prefix repeats on every block and costs width. */
export function shortGroupName(name: string) {
  return name.replace(/^مجموعة\s+/, "")
}

export function toneOf(index: number) {
  return BRANCH_TONES[index % BRANCH_TONES.length]
}

/**
 * Session block. Shows more lines the longer the session is; the tooltip
 * always carries the full summary, and clicking opens the details sheet.
 */
export function CalendarEvent({
  entry,
  onOpen,
  showBranch = true,
  className,
  style,
}: {
  entry: CalendarEntry
  onOpen: (entry: CalendarEntry) => void
  showBranch?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const { schedule, group, room, branch, supervisor } = entry
  const minutes = toMinutes(schedule.end) - toMinutes(schedule.start)
  const time = formatTimeRange(schedule.start, schedule.end)
  // Cancelling one date never touches the weekly schedule — only this occurrence is shown as cancelled
  const cancelled = entry.occurrence?.status === "CANCELLED"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen(entry)
          }}
          aria-label={`${group.name}، ${labels.weekday[schedule.day]} ${time}، ${room?.name ?? ""}${cancelled ? "، ملغاة" : ""}`}
          className={cn(
            "@container flex flex-col gap-0.5 overflow-hidden rounded-md border border-s-[3px] border-black/5 px-1.5 py-1 text-start text-xs leading-tight shadow-xs outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            toneOf(entry.tone).block,
            cancelled && "border-dashed bg-muted/70 opacity-70 hover:bg-muted",
            className
          )}
          style={style}
        >
          <span className={cn("truncate font-semibold text-foreground", cancelled && "line-through")}>
            {shortGroupName(group.name)}
          </span>
          {cancelled && <span className="text-[0.65rem] font-medium text-destructive">ملغاة</span>}
          <span className="truncate tabular-nums text-muted-foreground">
            {/* Narrow lanes show only the start time; the tooltip has the full range */}
            <span dir="ltr">
              {schedule.start}
              <span className="hidden @[5.5rem]:inline"> – {schedule.end}</span>
            </span>
          </span>
          {minutes >= 60 && (
            <span className="truncate text-muted-foreground">
              {room?.name}
              {showBranch && branch && (
                <span className="hidden @[8rem]:inline"> · {branch.name}</span>
              )}
            </span>
          )}
          {minutes >= 90 && supervisor && (
            <span className="truncate text-muted-foreground">{fullName(supervisor)}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 space-y-1 text-start">
        <p className="font-semibold">{group.name}</p>
        <p>
          {labels.weekday[schedule.day]}{" "}
          <span dir="ltr" className="tabular-nums">{time}</span>
        </p>
        <p className="flex items-center gap-1">
          <DoorOpen className="size-3" aria-hidden />
          {room?.name} · {branch?.name}
        </p>
        {supervisor && (
          <p className="flex items-center gap-1">
            <ShieldCheck className="size-3" aria-hidden />
            {fullName(supervisor)}
            {entry.assistants.length > 0 && ` + ${entry.assistants.length}`}
          </p>
        )}
        <p className="flex items-center gap-1">
          <Users className="size-3" aria-hidden />
          {countLabels.students(entry.studentCount)}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}
