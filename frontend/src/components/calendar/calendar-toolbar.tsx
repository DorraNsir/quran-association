"use client"

import { CalendarRange, ChevronLeft, ChevronRight, DoorOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type CalendarView = "week" | "rooms"

const VIEWS = [
  { value: "week", label: "الأسبوع", icon: CalendarRange },
  { value: "rooms", label: "القاعات", icon: DoorOpen },
] as const

/** Today / previous / next, the period label, and the desktop view switch. */
export function CalendarToolbar({
  label,
  isCurrentPeriod,
  view,
  onViewChange,
  onToday,
  onPrevious,
  onNext,
  periodName,
}: {
  label: string
  isCurrentPeriod: boolean
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  onToday: () => void
  onPrevious: () => void
  onNext: () => void
  /** "الأسبوع" or "اليوم", for accessible button labels */
  periodName: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={onToday} disabled={isCurrentPeriod}>
        اليوم
      </Button>
      <div className="flex items-center">
        <Button variant="ghost" size="icon" aria-label={`${periodName} السابق`} onClick={onPrevious}>
          <ChevronRight className="ltr:rotate-180" />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`${periodName} التالي`} onClick={onNext}>
          <ChevronLeft className="ltr:rotate-180" />
        </Button>
      </div>
      <h2 className="text-base font-semibold" aria-live="polite">
        {label}
      </h2>
      <div
        role="group"
        aria-label="طريقة العرض"
        className="ms-auto hidden items-center rounded-lg border bg-background p-0.5 md:flex"
      >
        {VIEWS.map(({ value, label: viewLabel, icon: Icon }) => (
          <Button
            key={value}
            size="sm"
            variant="ghost"
            aria-pressed={view === value}
            className={cn(view === value && "bg-muted text-foreground")}
            onClick={() => onViewChange(value)}
          >
            <Icon />
            {viewLabel}
          </Button>
        ))}
      </div>
    </div>
  )
}
