"use client"

import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { minutesBetween } from "@/lib/format"
import { labels, WEEK_ORDER } from "@/lib/i18n"
import type { ScheduleSlot, Weekday } from "@/types/domain"

/** Per-slot problems; conflict checks across rooms/teachers come with the calendar module. */
export function scheduleSlotError(slot: ScheduleSlot, all: ScheduleSlot[], index: number) {
  if (!slot.start || !slot.end) return "حدد وقت البداية والنهاية"
  if (minutesBetween(slot.start, slot.end) <= 0) return "يجب أن تكون النهاية بعد البداية"
  const overlaps = all.some(
    (other, i) =>
      i !== index &&
      other.day === slot.day &&
      other.start < slot.end &&
      slot.start < other.end
  )
  return overlaps ? "تتداخل مع حصة أخرى في نفس اليوم" : undefined
}

export function ScheduleEditor({
  id,
  value,
  onChange,
  showErrors,
}: {
  id: string
  value: ScheduleSlot[]
  onChange: (slots: ScheduleSlot[]) => void
  showErrors: boolean
}) {
  const update = (index: number, patch: Partial<ScheduleSlot>) =>
    onChange(value.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)))

  return (
    <div className="space-y-2 sm:col-span-2" id={id}>
      {value.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          لم تُضَف أي حصة بعد.
        </p>
      )}
      <ol className="space-y-2">
        {value.map((slot, index) => {
          const error = showErrors ? scheduleSlotError(slot, value, index) : undefined
          const rowLabel = `الحصة ${index + 1}`
          return (
            <li key={index} className="space-y-1">
              <div className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border bg-muted/30 p-2 sm:grid-cols-[9rem_1fr_1fr_auto] sm:items-center">
                <Select value={slot.day} onValueChange={(day) => update(index, { day: day as Weekday })}>
                  <SelectTrigger className="w-full bg-background" aria-label={`${rowLabel}: اليوم`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {WEEK_ORDER.map((day) => (
                      <SelectItem key={day} value={day}>
                        {labels.weekday[day]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="sm:order-last"
                  aria-label={`حذف ${rowLabel}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
                <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    من
                    <Input
                      type="time"
                      dir="ltr"
                      className="bg-background"
                      value={slot.start}
                      aria-invalid={error ? true : undefined}
                      aria-label={`${rowLabel}: البداية`}
                      onChange={(e) => update(index, { start: e.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    إلى
                    <Input
                      type="time"
                      dir="ltr"
                      className="bg-background"
                      value={slot.end}
                      aria-invalid={error ? true : undefined}
                      aria-label={`${rowLabel}: النهاية`}
                      onChange={(e) => update(index, { end: e.target.value })}
                    />
                  </label>
                </div>
              </div>
              {error && (
                <p role="alert" className="px-1 text-xs text-destructive">
                  {rowLabel}: {error}
                </p>
              )}
            </li>
          )
        })}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, { day: "SAT", start: "09:00", end: "11:00" }])}
      >
        <Plus />
        إضافة حصة
      </Button>
    </div>
  )
}
