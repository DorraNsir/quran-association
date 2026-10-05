"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addDays, startOfWeek } from "@/lib/dates"
import { ACADEMIC_YEAR } from "@/lib/mock/reference-date"
import { cn } from "@/lib/utils"
import type { ISODate } from "@/types/domain"

export interface Period {
  preset: string
  /** Only used by the "custom" preset */
  from?: ISODate
  to?: ISODate
}

export interface DateRange {
  from?: ISODate
  to?: ISODate
}

/**
 * Date-range presets, including the academic year and its terms — the
 * filters the end-of-year attendance count relies on.
 */
export function resolvePeriod(period: Period, today: ISODate): DateRange {
  const monthStart = `${today.slice(0, 8)}01`
  const term = ACADEMIC_YEAR.terms.find((t) => t.id === period.preset)
  if (term) return { from: term.start, to: term.end }
  switch (period.preset) {
    case "today":
      return { from: today, to: today }
    case "week":
      return { from: startOfWeek(today), to: addDays(startOfWeek(today), 6) }
    case "month": {
      const next = new Date(`${monthStart}T00:00:00Z`)
      next.setUTCMonth(next.getUTCMonth() + 1)
      return { from: monthStart, to: addDays(next.toISOString().slice(0, 10), -1) }
    }
    case "year":
      return { from: ACADEMIC_YEAR.start, to: ACADEMIC_YEAR.end }
    case "custom":
      return { from: period.from, to: period.to }
    default:
      return {}
  }
}

export function PeriodFilter({
  value,
  onChange,
  allLabel = "كل التواريخ",
  className,
}: {
  value: Period
  onChange: (period: Period) => void
  allLabel?: string
  className?: string
}) {
  return (
    <div className={cn("col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1", className)}>
      <Select value={value.preset} onValueChange={(preset) => onChange({ ...value, preset })}>
        <SelectTrigger
          aria-label="الفترة"
          className={cn("w-full bg-background sm:w-auto sm:min-w-40", value.preset !== "all" && "border-primary/40 bg-brand-soft/50")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="all">{allLabel}</SelectItem>
          <SelectItem value="today">اليوم</SelectItem>
          <SelectItem value="week">هذا الأسبوع</SelectItem>
          <SelectItem value="month">هذا الشهر</SelectItem>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>السنة الدراسية {ACADEMIC_YEAR.label}</SelectLabel>
            <SelectItem value="year">كامل السنة الدراسية</SelectItem>
            {ACADEMIC_YEAR.terms.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value="custom">فترة مخصصة…</SelectItem>
        </SelectContent>
      </Select>
      {value.preset === "custom" && (
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            aria-label="من تاريخ"
            className="bg-background"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="إلى تاريخ"
            className="bg-background"
            value={value.to ?? ""}
            min={value.from}
            onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
          />
        </div>
      )}
    </div>
  )
}
