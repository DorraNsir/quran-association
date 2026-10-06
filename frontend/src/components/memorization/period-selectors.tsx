"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { labels } from "@/lib/i18n"
import { SEMESTERS } from "@/lib/memorization"
import { cn } from "@/lib/utils"
import type { AcademicYear, ID, Semester } from "@/types/domain"

export function AcademicYearSelect({
  value,
  onChange,
  years,
  className,
}: {
  value: ID
  onChange: (id: ID) => void
  years: AcademicYear[]
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="السنة الدراسية" className={cn("w-full bg-background sm:w-auto sm:min-w-44", className)}>
        <span className="text-muted-foreground">السنة الدراسية:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {[...years].reverse().map((y) => (
          <SelectItem key={y.id} value={y.id}>
            {/* "2026–2027" must stay left-to-right inside Arabic text */}
            <span dir="ltr">{y.label}</span>
            {y.isCurrent && <span className="text-xs text-muted-foreground">(الحالية)</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function SemesterSelect({
  value,
  onChange,
  className,
}: {
  value: Semester
  onChange: (semester: Semester) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Semester)}>
      <SelectTrigger aria-label="السداسي" className={cn("w-full bg-background sm:w-auto sm:min-w-40", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {SEMESTERS.map((s) => (
          <SelectItem key={s} value={s}>
            {labels.semester[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
