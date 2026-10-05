import { Percent } from "lucide-react"

import { countOf, type AttendanceSummary } from "@/lib/attendance"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"

import { ATTENDANCE_STYLE } from "./attendance-badges"

/** Rate (with its formula) next to the raw counts — never a score on its own. */
export function AttendanceStats({
  summary,
  extra,
  className,
}: {
  summary: AttendanceSummary
  /** Optional leading tile, e.g. number of sessions */
  extra?: { label: string; value: React.ReactNode }
  className?: string
}) {
  const tiles = (["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((status) => ({
    status,
    value: countOf(summary, status),
  }))

  return (
    <dl className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6", className)}>
      {extra && (
        <div className="flex flex-col-reverse rounded-xl border bg-card p-3">
          <dt className="text-xs text-muted-foreground">{extra.label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{extra.value}</dd>
        </div>
      )}
      <div className="flex flex-col-reverse rounded-xl border border-primary/30 bg-brand-soft/40 p-3">
        <dt className="flex items-center gap-1 text-xs text-muted-foreground" title="(حاضر + متأخر) ÷ (المسجَّل − الغياب المبرر)">
          <Percent className="size-3.5" aria-hidden />
          نسبة الحضور
        </dt>
        <dd className="text-xl font-semibold tabular-nums">
          {summary.rate === null ? "—" : `${summary.rate}%`}
        </dd>
      </div>
      {tiles.map(({ status, value }) => {
        const { icon: Icon, badge } = ATTENDANCE_STYLE[status]
        return (
          <div key={status} className="flex flex-col-reverse rounded-xl border bg-card p-3">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("flex size-4 items-center justify-center rounded-full", badge)}>
                <Icon className="size-3" aria-hidden />
              </span>
              {labels.attendance[status]}
            </dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

export function AttendanceProgress({
  recorded,
  expected,
  className,
}: {
  recorded: number
  expected: number
  className?: string
}) {
  const percent = expected === 0 ? 0 : Math.round((recorded / expected) * 100)
  const done = expected > 0 && recorded >= expected
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          <span className="tabular-nums">{recorded}</span> / <span className="tabular-nums">{expected}</span> مسجَّل
        </span>
        <span className={cn("tabular-nums", done ? "text-primary" : "text-muted-foreground")}>{percent}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="تقدم تسجيل الحضور"
        aria-valuemin={0}
        aria-valuemax={expected}
        aria-valuenow={recorded}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", done ? "bg-primary" : "bg-warning")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
