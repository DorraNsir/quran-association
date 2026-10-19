"use client"

import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { TeacherRoleBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/empty-state"
import { Pager } from "@/components/shared/pager"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { QueryState } from "@/components/shared/query-state"
import { TimeRange } from "@/components/shared/time-range"
import { Card } from "@/components/ui/card"
import { useTeacherAttendanceRecords } from "@/lib/api/attendance"
import { todayInTunis, weekdayOf } from "@/lib/dates"
import { countLabels, formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { useCurrentAcademicYear, usePlatformSettings } from "@/lib/store/settings"
import { workspacePaths } from "@/lib/workspace"

import { AttendanceStatusBadge } from "./attendance-badges"
import { AttendancePeriodStats } from "./attendance-period-stats"

/**
 * A teacher's OWN attendance in the sessions they taught (team snapshot):
 * monthly / yearly totals, then session by session. The admin reads any
 * teacher; a teacher reads only themself (scope "teacher", no id).
 */
export function TeacherAttendanceHistory({ teacherId, scope }: { teacherId?: string; scope: "admin" | "teacher" }) {
  const today = todayInTunis()
  const pageSize = usePlatformSettings().defaultPageSize
  const [period, setPeriod] = useState<Period>({ preset: "year" })
  const [page, setPage] = useState(1)
  const range = resolvePeriod(period, today, useCurrentAcademicYear())
  const records = useTeacherAttendanceRecords(scope, teacherId, { from: range.from, to: range.to }, page, pageSize)
  const entries = records.data?.data ?? []
  const paths = workspacePaths(scope)

  return (
    <div className="space-y-5">
      <AttendancePeriodStats subject={{ kind: "teacher", scope, id: teacherId }} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">سجل الحضور حسب الحصة</h3>
        <PeriodFilter
          value={period}
          onChange={(p) => {
            setPeriod(p)
            setPage(1)
          }}
        />
      </div>

      <QueryState query={records}>
        <Card className="gap-0 p-0">
          {entries.length === 0 ? (
            <EmptyState icon={ClipboardList} title="لم يُسجَّل حضور بعد" description="لا توجد سجلات حضور في الفترة المختارة." />
          ) : (
            <ol className="divide-y">
              {entries.map((record) => (
                <li key={record.sessionId}>
                  <Link
                    href={paths.session(record.sessionId)}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {labels.weekday[weekdayOf(record.date)]} {formatDate(record.date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {record.groupClass.group.name} ·{" "}
                        <TimeRange start={record.startTime} end={record.endTime} />
                        {record.sessionStatus === "CANCELLED" && " · حصة ملغاة (لا تُحتسب)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {record.note && <span className="text-xs text-muted-foreground">{record.note}</span>}
                      {record.role && <TeacherRoleBadge role={record.role} />}
                      <AttendanceStatusBadge status={record.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Pager page={page} totalPages={records.data?.meta.totalPages ?? 1} onPage={setPage} />
        {entries.length > 0 && <p className="text-xs text-muted-foreground">{countLabels.sessions(records.data?.meta.total ?? entries.length)}</p>}
      </QueryState>
    </div>
  )
}
