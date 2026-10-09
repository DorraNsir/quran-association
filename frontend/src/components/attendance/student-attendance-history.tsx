"use client"

import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterSelect } from "@/components/shared/filters"
import { Pager } from "@/components/shared/pager"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { QueryState } from "@/components/shared/query-state"
import { Card } from "@/components/ui/card"
import { useStudentAttendanceRecords, useStudentAttendanceSummary } from "@/lib/api/attendance"
import { MAX_PAGE } from "@/lib/api/sessions"
import { ATTENDANCE_STATUSES } from "@/lib/attendance"
import { todayInTunis, weekdayOf } from "@/lib/dates"
import { countLabels, formatDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { useCurrentAcademicYear } from "@/lib/store/settings"
import { workspacePaths, type Workspace } from "@/lib/workspace"
import type { ID } from "@/types/domain"

import { AttendanceStatusBadge } from "./attendance-badges"
import { AttendanceStats } from "./attendance-stats"

/**
 * A student's attendance, session by session, with totals for the chosen
 * period — from the API: the admin endpoint, the teacher endpoint (only for
 * a student the teacher taught during the period) or the student's own.
 */
export function StudentAttendanceHistory({ studentId, workspace = "admin" }: { studentId?: ID; workspace?: Workspace }) {
  const today = todayInTunis()
  const [period, setPeriod] = useState<Period>({ preset: "year" })
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const currentYear = useCurrentAcademicYear()
  const range = resolvePeriod(period, today, currentYear)
  const filter = { from: range.from, to: range.to }
  const records = useStudentAttendanceRecords(workspace, studentId, filter, page, MAX_PAGE)
  const summary = useStudentAttendanceSummary(workspace, studentId, filter)
  const entries = records.data?.data ?? []
  const shown = status === ALL ? entries : entries.filter((e) => e.status === status)
  const sessionHref = (id: ID) => (workspace === "student" ? undefined : workspacePaths(workspace).session(id))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodFilter
          value={period}
          onChange={(p) => {
            setPeriod(p)
            setPage(1)
          }}
        />
        <FilterSelect
          label="الحالة"
          allLabel="كل الحالات"
          value={status}
          onValueChange={setStatus}
          options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: labels.attendance[s] }))}
        />
      </div>

      <QueryState query={[records, summary]}>
        {summary.data && <AttendanceStats summary={summary.data} extra={{ label: "الحصص المسجّلة", value: summary.data.recorded }} />}

        <Card className="gap-0 p-0">
          {shown.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={entries.length === 0 ? "لم يتم تسجيل الحضور بعد" : "لا توجد سجلات بهذه الحالة"}
              description={entries.length === 0 ? "لا توجد سجلات حضور في الفترة المختارة." : undefined}
            />
          ) : (
            <ol className="divide-y">
              {shown.map((record) => {
                const content = (
                  <>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {labels.weekday[weekdayOf(record.date)]} {formatDate(record.date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {record.groupClass.group.name} ·{" "}
                        <span dir="ltr" className="inline-block tabular-nums">{formatTimeRange(record.startTime, record.endTime)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {record.note && <span className="text-xs text-muted-foreground">{record.note}</span>}
                      <AttendanceStatusBadge status={record.status} />
                    </div>
                  </>
                )
                const href = sessionHref(record.sessionId)
                const className = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
                return (
                  <li key={record.sessionId}>
                    {href ? (
                      <Link href={href} className={`${className} transition-colors hover:bg-muted/40`}>{content}</Link>
                    ) : (
                      <div className={className}>{content}</div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </Card>
        <Pager page={page} totalPages={records.data?.meta.totalPages ?? 1} onPage={setPage} />
        {shown.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {countLabels.sessions(records.data?.meta.total ?? shown.length)} · نسبة الحضور = (حاضر + متأخر) ÷ (الحصص المسجّلة − الغياب المبرر).
          </p>
        )}
      </QueryState>
    </div>
  )
}
