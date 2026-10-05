"use client"

import { CheckCircle2, Plus, Trash2 } from "lucide-react"

import { ConflictAlert } from "@/components/scheduling/conflict-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Lookups } from "@/lib/domain"
import { labels, WEEK_ORDER } from "@/lib/i18n"
import { isValidTimeRange, type SessionCheck, type SessionDraft } from "@/lib/scheduling"
import type { ID, Weekday } from "@/types/domain"

/** Field-level problems of a row (conflicts are reported separately). */
export function draftError(row: SessionDraft) {
  if (!isValidTimeRange(row.start, row.end)) return "يجب أن تكون ساعة النهاية بعد ساعة البداية"
  if (!row.branchId || !row.roomId) return "اختر الفرع والقاعة"
  return undefined
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  )
}

export function ScheduleEditor({
  id,
  rows,
  onChange,
  lookups,
  checks,
  defaultLocation,
  showErrors,
}: {
  id: string
  rows: SessionDraft[]
  onChange: (rows: SessionDraft[]) => void
  lookups: Lookups
  /** Conflicts + free rooms per row key; rows without an entry aren't checked (incomplete, or inactive group) */
  checks: Map<string, SessionCheck>
  defaultLocation: { branchId: ID; roomId: ID }
  showErrors: boolean
}) {
  const update = (key: string, patch: Partial<SessionDraft>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  function addRow() {
    const usedDays = new Set(rows.map((r) => r.day))
    const day = WEEK_ORDER.find((d) => !usedDays.has(d)) ?? "SAT"
    const last = rows[rows.length - 1]
    onChange([
      ...rows,
      {
        key: `draft-${Date.now()}`,
        day,
        start: last?.start ?? "09:00",
        end: last?.end ?? "11:00",
        branchId: defaultLocation.branchId,
        roomId: defaultLocation.roomId,
      },
    ])
  }

  return (
    <div className="space-y-3 sm:col-span-2" id={id} tabIndex={-1}>
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          لم يُضَف أي يوم دراسة بعد.
        </p>
      )}
      <ol className="space-y-3">
        {rows.map((row, index) => {
          const rowLabel = `يوم الدراسة ${index + 1}`
          const error = draftError(row)
          const result = error ? undefined : checks.get(row.key)
          const branchRooms = lookups.rooms.filter(
            (r) => r.branchId === row.branchId && (r.status === "ACTIVE" || r.id === row.roomId)
          )
          const branches = lookups.branches.filter(
            (b) => b.status === "ACTIVE" || b.id === row.branchId
          )
          return (
            <li key={row.key} className="space-y-2 rounded-lg border bg-muted/30 p-3" aria-label={rowLabel}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_1fr_1fr_auto] sm:items-end">
                <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
                  <div className="flex-1">
                    <Labeled label="اليوم">
                      <Select value={row.day} onValueChange={(day) => update(row.key, { day: day as Weekday })}>
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
                    </Labeled>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="sm:hidden"
                    aria-label={`حذف ${rowLabel}`}
                    onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Labeled label="من">
                  <Input
                    type="time"
                    dir="ltr"
                    step={900}
                    className="bg-background"
                    value={row.start}
                    aria-invalid={showErrors && error ? true : undefined}
                    onChange={(e) => update(row.key, { start: e.target.value })}
                  />
                </Labeled>
                <Labeled label="إلى">
                  <Input
                    type="time"
                    dir="ltr"
                    step={900}
                    className="bg-background"
                    value={row.end}
                    aria-invalid={showErrors && error ? true : undefined}
                    onChange={(e) => update(row.key, { end: e.target.value })}
                  />
                </Labeled>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex"
                  aria-label={`حذف ${rowLabel}`}
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Labeled label="الفرع">
                  <Select
                    value={row.branchId}
                    onValueChange={(branchId) =>
                      branchId !== row.branchId && update(row.key, { branchId, roomId: "" })
                    }
                  >
                    <SelectTrigger className="w-full bg-background" aria-label={`${rowLabel}: الفرع`}>
                      <SelectValue placeholder="اختر الفرع" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Labeled>
                <Labeled label="القاعة">
                  <Select value={row.roomId} onValueChange={(roomId) => update(row.key, { roomId })}>
                    <SelectTrigger
                      className="w-full bg-background"
                      aria-label={`${rowLabel}: القاعة`}
                      aria-invalid={showErrors && !row.roomId ? true : undefined}
                    >
                      <SelectValue placeholder="اختر القاعة" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {branchRooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Labeled>
              </div>

              {error && (showErrors || isValidTimeRange(row.start, row.end) === false) && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              {result && result.conflicts.length > 0 && (
                <ConflictAlert
                  conflicts={result.conflicts}
                  lookups={lookups}
                  freeRooms={result.freeRooms}
                  onPickRoom={(roomId) => update(row.key, { roomId })}
                />
              )}
              {result && result.conflicts.length === 0 && (
                <p className="flex items-center gap-1.5 text-xs text-primary">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  القاعة والمعلمون متاحون في هذا الوقت
                </p>
              )}
            </li>
          )
        })}
      </ol>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus />
        إضافة يوم دراسة
      </Button>
    </div>
  )
}
