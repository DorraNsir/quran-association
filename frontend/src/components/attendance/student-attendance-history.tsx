"use client"

import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { useSessionRows } from "@/components/sessions/use-session-rows"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterSelect } from "@/components/shared/filters"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { Card } from "@/components/ui/card"
import { ATTENDANCE_STATUSES, summarize } from "@/lib/attendance"
import { isWithin, weekdayOf } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { countLabels, formatDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { ID, ISODate, Student } from "@/types/domain"

import { AttendanceStatusBadge } from "./attendance-badges"
import { AttendanceStats } from "./attendance-stats"

/** A student's attendance, session by session, with totals for the chosen period. */
export function StudentAttendanceHistory({
  studentId,
  lookups,
  students,
  today,
}: {
  studentId: ID
  lookups: Lookups
  students: Student[]
  today: ISODate
}) {
  const rows = useSessionRows(lookups, students, today)
  const [period, setPeriod] = useState<Period>({ preset: "year" })
  const [status, setStatus] = useState(ALL)
  const range = resolvePeriod(period, today)

  const entries = rows
    .flatMap((row) => {
      const record = row.records.find((r) => r.studentId === studentId)
      return record && isWithin(row.session.date, range) ? [{ row, record }] : []
    })
    .reverse()
  const summary = summarize(entries.map((e) => e.record))
  const shown = status === ALL ? entries : entries.filter((e) => e.record.status === status)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodFilter value={period} onChange={setPeriod} />
        <FilterSelect
          label="الحالة"
          allLabel="كل الحالات"
          value={status}
          onValueChange={setStatus}
          options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: labels.attendance[s] }))}
        />
      </div>

      <AttendanceStats summary={summary} extra={{ label: "الحصص المسجّلة", value: summary.recorded }} />

      <Card className="gap-0 p-0">
        {shown.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={entries.length === 0 ? "لم يتم تسجيل الحضور بعد" : "لا توجد سجلات بهذه الحالة"}
            description={entries.length === 0 ? "لا توجد سجلات حضور لهذا الطالب في الفترة المختارة." : undefined}
          />
        ) : (
          <ol className="divide-y">
            {shown.map(({ row, record }) => (
              <li key={record.id}>
                <Link
                  href={`/admin/sessions/${row.session.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {labels.weekday[weekdayOf(row.session.date)]} {formatDate(row.session.date)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.group?.name} ·{" "}
                      <span dir="ltr" className="tabular-nums">{formatTimeRange(row.session.start, row.session.end)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.note && <span className="text-xs text-muted-foreground">{record.note}</span>}
                    <AttendanceStatusBadge status={record.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {shown.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {countLabels.sessions(shown.length)} · نسبة الحضور = (حاضر + متأخر) ÷ (الحصص المسجّلة − الغياب المبرر).
        </p>
      )}
    </div>
  )
}
