"use client"

import { ClipboardList, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { toSessionRow } from "@/components/sessions/use-session-rows"
import { QueryState } from "@/components/shared/query-state"
import { useStudentsAttendanceSummary } from "@/lib/api/attendance"
import { MAX_PAGE, useSessionPage } from "@/lib/api/sessions"
import { EmptyState } from "@/components/shared/empty-state"
import { FilterSelect } from "@/components/shared/filters"
import { SectionCard } from "@/components/shared/info-list"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { PersonCell } from "@/components/shared/user-avatar"
import type { AttendanceSummary } from "@/lib/attendance"
import { weekdayOf } from "@/lib/dates"
import { classesOf, fullName, indexLookups, studentClass, type Lookups } from "@/lib/domain"
import { countLabels, formatShortDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ID, ISODate, Student } from "@/types/domain"

import { AttendanceStateLabel } from "./attendance-badges"
import { AttendanceStats } from "./attendance-stats"
import { useCurrentAcademicYear } from "@/lib/store/settings"

/** Group-level attendance: totals, each session's counts, and every member's record. */
export function GroupAttendance({
  groupId,
  lookups,
  students,
  today,
}: {
  groupId: ID
  lookups: Lookups
  students: Student[]
  today: ISODate
}) {
  const [period, setPeriod] = useState<Period>({ preset: "year" })
  const [classId, setClassId] = useState("all")
  const currentYear = useCurrentAcademicYear()
  const range = resolvePeriod(period, today, currentYear)
  const indexes = indexLookups(lookups)
  const classes = classesOf(groupId, lookups.groupClasses)
  /** "Branch — supervisor": distinguishes this group's classes */
  const classTag = (groupClassId: ID) => {
    const v = studentClass({ groupClassId }, indexes)
    return v ? `${v.branch?.name ?? ""} — ${v.supervisor ? fullName(v.supervisor) : "—"}` : ""
  }
  const inClass = (groupClassId?: ID) => (classId === "all" ? classes.some((c) => c.id === groupClassId) : groupClassId === classId)
  // Sessions that have happened (or happen today), latest first — counts and per-student totals from the API
  const to = range.to && range.to < today ? range.to : today
  const valid = !range.from || range.from <= to
  const scope = { from: range.from, to, groupId, groupClassId: classId === "all" ? undefined : classId }
  const list = useSessionPage("admin", { ...scope, order: "desc" }, 1, MAX_PAGE, valid)
  const completedQuery = useSessionPage("admin", { ...scope, status: "COMPLETED" }, 1, 1, valid)
  const pendingQuery = useSessionPage("admin", { ...scope, status: "SCHEDULED" }, 1, 1, valid)
  const cancelledQuery = useSessionPage("admin", { ...scope, status: "CANCELLED" }, 1, 1, valid)
  const held = valid ? (completedQuery.data?.meta.total ?? 0) : 0
  const pending = valid ? (pendingQuery.data?.meta.total ?? 0) : 0
  const cancelled = valid ? (cancelledQuery.data?.meta.total ?? 0) : 0
  const lines = useStudentsAttendanceSummary(scope, valid)
  const rows = valid ? (list.data?.data ?? []).map((s) => toSessionRow(s, today)) : []
  const byStudent = new Map((valid ? (lines.data ?? []) : []).map((l) => [l.studentId, l]))
  const total = [...byStudent.values()].reduce<AttendanceSummary>(
    (sum, l) => ({ recorded: sum.recorded + l.recorded, present: sum.present + l.present, absent: sum.absent + l.absent, late: sum.late + l.late, excused: sum.excused + l.excused, rate: null }),
    { recorded: 0, present: 0, absent: 0, late: 0, excused: 0, rate: null }
  )
  const eligible = total.recorded - total.excused
  const summary = { ...total, rate: eligible > 0 ? Math.round(((total.present + total.late) / eligible) * 1000) / 10 : null }
  const members = students.filter((s) => inClass(s.groupClassId) && s.status === "ACTIVE")
  const empty: AttendanceSummary = { recorded: 0, present: 0, absent: 0, late: 0, excused: 0, rate: null }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          {classes.length > 1 && (
            <FilterSelect label="الحلقة" allLabel={`كل الحلقات (${classes.length})`} value={classId} onValueChange={setClassId}
              options={classes.map((c) => ({ value: c.id, label: classTag(c.id) }))} />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {countLabels.sessions(held)} منجزة ·{" "}
          {pending > 0 && <span className="text-warning">{countLabels.sessions(pending)} بحضور غير مكتمل · </span>}
          {countLabels.sessions(cancelled)} ملغاة
        </p>
      </div>

      <AttendanceStats summary={summary} extra={{ label: "الحصص المنجزة", value: held }} />

      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard title="سجل الحصص" icon={ClipboardList} className="lg:col-span-2">
          <QueryState query={list}>
          {rows.length === 0 ? (
            <EmptyState icon={ClipboardList} title="لا توجد حصص في هذه الفترة" className="py-6" />
          ) : (
            <ol className="-mx-2 max-h-[32rem] space-y-1 overflow-y-auto">
              {rows.map((r) => (
                <li key={r.session.id}>
                  <Link
                    href={`/admin/sessions/${r.session.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <span className="min-w-0 text-sm font-medium">
                      {labels.weekdayShort[weekdayOf(r.session.date)]} {formatShortDate(r.session.date)}
                      {classes.length > 1 && (
                        <span className="block truncate text-xs font-normal text-muted-foreground">{classTag(r.session.groupClassId)}</span>
                      )}
                    </span>
                    {r.progress.state === "COMPLETE" ? (
                      <span className="flex gap-2 text-xs tabular-nums text-muted-foreground">
                        <span className="text-primary">{r.summary.present + r.summary.late} حاضر</span>
                        {r.summary.absent > 0 && <span className="text-destructive">{r.summary.absent} غائب</span>}
                        {r.summary.excused > 0 && <span>{r.summary.excused} مبرر</span>}
                      </span>
                    ) : (
                      <AttendanceStateLabel {...r.progress} className="text-xs" />
                    )}
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {(list.data?.meta.total ?? 0) > rows.length && (
            <p className="mt-2 text-xs text-muted-foreground">آخر {rows.length} حصة — بقية الحصص في صفحة الحصص.</p>
          )}
          </QueryState>
        </SectionCard>

        <SectionCard title="حضور الطلبة" icon={Users} className="lg:col-span-3">
          {members.length === 0 ? (
            <EmptyState icon={Users} title="لا يوجد طلبة نشطون" className="py-6" />
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <caption className="sr-only">حضور كل طالب في الفترة المختارة</caption>
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="px-6 pb-2 text-start font-medium">الطالب</th>
                    {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((s) => (
                      <th key={s} scope="col" className="px-2 pb-2 text-center font-medium">{labels.attendance[s]}</th>
                    ))}
                    <th scope="col" className="px-6 pb-2 text-center font-medium">النسبة</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map((student) => {
                    const s = byStudent.get(student.id) ?? empty
                    return (
                      <tr key={student.id}>
                        <td className="px-6 py-2">
                          <Link href={`/admin/students/${student.id}`} className="hover:opacity-80">
                            <PersonCell name={fullName(student)} photoUrl={student.photoUrl} size="sm"
                              secondary={classes.length > 1 ? classTag(student.groupClassId) : undefined} />
                          </Link>
                        </td>
                        <td className="px-2 text-center tabular-nums">{s.present}</td>
                        <td className="px-2 text-center tabular-nums">{s.late}</td>
                        <td className={cn("px-2 text-center tabular-nums", s.absent > 0 && "font-medium text-destructive")}>{s.absent}</td>
                        <td className="px-2 text-center tabular-nums">{s.excused}</td>
                        <td className={cn("px-6 text-center font-medium tabular-nums", s.rate !== null && s.rate < 75 && "text-warning")}>
                          {s.rate === null ? "—" : `${s.rate}%`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
