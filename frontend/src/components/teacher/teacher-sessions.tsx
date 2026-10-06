"use client"

import { CalendarX2, DoorOpen, Users } from "lucide-react"
import Link from "next/link"

import { AttendanceStateLabel } from "@/components/attendance/attendance-badges"
import { AttendanceAction } from "@/components/sessions/attendance-action"
import { useSessionRows, type SessionRow } from "@/components/sessions/use-session-rows"
import { EmptyState } from "@/components/shared/empty-state"
import { weekDates, weekdayOf } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { countLabels, formatShortDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { getTeacherClassIds } from "@/lib/teacher-access"
import type { ID, ISODate, Student } from "@/types/domain"

/** Live sessions of the teacher's classes only (from the shared store). */
export function useTeacherSessionRows(teacherId: ID, lookups: Lookups, students: Student[], today: ISODate) {
  const classIds = getTeacherClassIds(teacherId, lookups)
  return useSessionRows(lookups, students, today).filter((r) => classIds.has(r.session.groupClassId))
}

/** Past or today's sessions whose attendance is missing or incomplete. */
export function isAttendancePending(row: SessionRow, today: ISODate) {
  return row.session.date <= today && (row.progress.state === "NOT_RECORDED" || row.progress.state === "PARTIAL")
}

/** Compact, tappable session rows with the attendance action — for phones first. */
export function TeacherSessionList({
  rows,
  today,
  showDate = true,
  emptyTitle,
}: {
  rows: SessionRow[]
  today: ISODate
  showDate?: boolean
  emptyTitle: string
}) {
  if (rows.length === 0) return <EmptyState icon={CalendarX2} title={emptyTitle} className="py-6" />
  return (
    <ol className="space-y-2">
      {rows.map((row) => {
        const { session } = row
        return (
          <li key={session.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-4">
            <Link href={`/teacher/sessions/${session.id}`} className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-80">
              <div className="w-16 shrink-0 text-center">
                <p className="text-base font-semibold tabular-nums" dir="ltr">{session.start}</p>
                {showDate && (
                  <p className="text-xs text-muted-foreground">
                    {session.date === today ? "اليوم" : `${labels.weekdayShort[weekdayOf(session.date)]} ${formatShortDate(session.date)}`}
                  </p>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1 border-s ps-3">
                <p className="font-medium">
                  {row.group?.name} <span className="text-sm font-normal text-muted-foreground">— {row.branch?.name}</span>
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <DoorOpen className="size-3.5" aria-hidden />
                    {row.room?.name} · <span dir="ltr" className="tabular-nums">{formatTimeRange(session.start, session.end)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" aria-hidden />
                    {countLabels.students(row.roster.length)}
                  </span>
                </div>
                <AttendanceStateLabel {...row.progress} className="text-xs" />
              </div>
            </Link>
            <div className="sm:shrink-0 [&>a]:w-full sm:[&>a]:w-auto">
              <AttendanceAction row={row} today={today} workspace="teacher" />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** This week's dated sessions of the teacher (cancellations included, so they are visible). */
export function TeacherWeekSessions({
  teacherId,
  lookups,
  students,
  today,
}: {
  teacherId: ID
  lookups: Lookups
  students: Student[]
  today: ISODate
}) {
  const week = weekDates(today)
  const from = week[0].date
  const to = week[week.length - 1].date
  const rows = useTeacherSessionRows(teacherId, lookups, students, today).filter(
    (r) => r.session.date >= from && r.session.date <= to
  )
  return <TeacherSessionList rows={rows} today={today} emptyTitle="لا توجد حصص هذا الأسبوع" />
}
