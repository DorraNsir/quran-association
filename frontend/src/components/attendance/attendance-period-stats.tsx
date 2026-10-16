"use client"

import { CalendarDays, CalendarRange } from "lucide-react"
import { useState } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useStudentAttendanceSummary,
  useTeacherAttendanceSummary,
  type AttendanceTotals,
} from "@/lib/api/attendance"
import { todayInTunis } from "@/lib/dates"
import { formatMonthName } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { useAcademicYears } from "@/lib/store/settings"
import { cn } from "@/lib/utils"
import type { ISODate } from "@/types/domain"

import { ATTENDANCE_STYLE } from "./attendance-badges"

/** Whose attendance, through which endpoint (the API checks access). */
export type AttendanceSubjectRef =
  | { kind: "student"; scope: "admin" | "teacher" | "student"; id?: string }
  | { kind: "teacher"; scope: "admin" | "teacher"; id?: string }

/** First and last day of a month ("2026-10" → 2026-10-01 … 2026-10-31). */
export function monthRange(year: number, month: number): { from: ISODate; to: ISODate } {
  const pad = (n: number) => String(n).padStart(2, "0")
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` }
}

function useTotals(subject: AttendanceSubjectRef, period: { from?: ISODate; to?: ISODate }, enabled: boolean) {
  // Both hooks are always called (rules of hooks); only the subject's one fetches
  const student = useStudentAttendanceSummary(
    subject.kind === "student" ? subject.scope : "admin",
    subject.id,
    period,
    enabled && subject.kind === "student"
  )
  const teacher = useTeacherAttendanceSummary(
    subject.kind === "teacher" ? subject.scope : "admin",
    subject.id,
    period,
    enabled && subject.kind === "teacher"
  )
  return subject.kind === "student" ? student : teacher
}

/**
 * Monthly and academic-year attendance, as «حضر / الحصص المحتسبة» and a rate.
 * The numbers are the API's (one rule for everyone): حاضر + متأخر count as
 * attended, غائب counts against, غياب مبرر is shown apart and left out, and
 * unrecorded / cancelled / future sessions never count.
 */
export function AttendancePeriodStats({ subject, className }: { subject: AttendanceSubjectRef; className?: string }) {
  const today = todayInTunis()
  const years = useAcademicYears()
  const [month, setMonth] = useState(() => ({ year: +today.slice(0, 4), month: +today.slice(5, 7) }))
  const [yearId, setYearId] = useState<string | undefined>(undefined)
  const academicYear = years.find((y) => y.id === yearId) ?? years.find((y) => y.isCurrent) ?? years[0]

  const monthly = useTotals(subject, monthRange(month.year, month.month), true)
  const yearly = useTotals(
    subject,
    academicYear ? { from: academicYear.startDate, to: academicYear.endDate } : {},
    Boolean(academicYear)
  )

  // Calendar years offered: those the academic years cover, plus the current one
  const calendarYears = [
    ...new Set([+today.slice(0, 4), ...years.flatMap((y) => [+y.startDate.slice(0, 4), +y.endDate.slice(0, 4)])]),
  ].sort((a, b) => b - a)

  return (
    <section aria-label="إحصائيات الحضور" className={cn("grid gap-4 md:grid-cols-2", className)}>
      <TotalsCard
        icon={CalendarDays}
        title="الحضور الشهري"
        controls={
          <>
            <Select value={String(month.month)} onValueChange={(m) => setMonth((p) => ({ ...p, month: +m }))}>
              <SelectTrigger aria-label="الشهر" size="sm" className="min-w-28 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {formatMonthName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(month.year)} onValueChange={(y) => setMonth((p) => ({ ...p, year: +y }))}>
              <SelectTrigger aria-label="السنة" size="sm" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {calendarYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        totals={monthly.data}
        loading={monthly.isPending}
        failed={monthly.isError}
      />
      <TotalsCard
        icon={CalendarRange}
        title="الحضور السنوي"
        controls={
          years.length > 1 ? (
            <Select value={academicYear?.id} onValueChange={setYearId}>
              <SelectTrigger aria-label="السنة الدراسية" size="sm" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            academicYear && <span className="text-sm text-muted-foreground">{academicYear.label}</span>
          )
        }
        totals={academicYear ? yearly.data : undefined}
        loading={Boolean(academicYear) && yearly.isPending}
        failed={yearly.isError}
        emptyHint={academicYear ? undefined : "لا توجد سنة دراسية حالية"}
      />
    </section>
  )
}

function TotalsCard({
  icon: Icon,
  title,
  controls,
  totals,
  loading,
  failed,
  emptyHint,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  controls: React.ReactNode
  totals?: AttendanceTotals
  loading: boolean
  failed: boolean
  emptyHint?: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-primary" aria-hidden />
          {title}
        </h3>
        <div className="flex flex-wrap items-center gap-2">{controls}</div>
      </div>
      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : failed ? (
        <p className="py-4 text-sm text-destructive">تعذّر تحميل الإحصائيات</p>
      ) : !totals ? (
        <p className="py-4 text-sm text-muted-foreground">{emptyHint ?? "—"}</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="text-2xl font-semibold text-foreground tabular-nums" dir="ltr">
                {totals.attended} / {totals.eligible}
              </span>{" "}
              حصة
            </p>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                totals.rate !== null && totals.rate < 75 ? "text-warning" : "text-primary"
              )}
              aria-label="نسبة الحضور"
            >
              {totals.rate === null ? "—" : `${totals.rate}%`}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2 2xl:grid-cols-4">
            {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((status) => {
              const { icon: StatusIcon, badge } = ATTENDANCE_STYLE[status]
              const value = totals[({ PRESENT: "present", LATE: "late", ABSENT: "absent", EXCUSED: "excused" } as const)[status]]
              return (
                <div key={status} className="flex flex-col-reverse rounded-lg bg-muted/50 p-2 text-center">
                  <dt className="flex items-center justify-center gap-1 text-[0.7rem] text-muted-foreground">
                    <span className={cn("flex size-3.5 items-center justify-center rounded-full", badge)}>
                      <StatusIcon className="size-2.5" aria-hidden />
                    </span>
                    {labels.attendance[status]}
                  </dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              )
            })}
          </dl>
          <p className="text-xs text-muted-foreground">
            النسبة = (حاضر + متأخر) ÷ (حاضر + متأخر + غائب). الغياب المبرر لا يُحتسب، ولا تُحتسب الحصص غير المسجّلة أو الملغاة.
          </p>
        </>
      )}
    </div>
  )
}
