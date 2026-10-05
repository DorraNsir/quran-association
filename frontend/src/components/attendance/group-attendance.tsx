"use client"

import { ClipboardList, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { useSessionRows } from "@/components/sessions/use-session-rows"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionCard } from "@/components/shared/info-list"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { PersonCell } from "@/components/shared/user-avatar"
import { summarize } from "@/lib/attendance"
import { isWithin, weekdayOf } from "@/lib/dates"
import { fullName, type Lookups } from "@/lib/domain"
import { countLabels, formatShortDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ID, ISODate, Student } from "@/types/domain"

import { AttendanceStateLabel } from "./attendance-badges"
import { AttendanceStats } from "./attendance-stats"

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
  const range = resolvePeriod(period, today)
  const rows = useSessionRows(lookups, students, today).filter(
    (r) => r.session.groupId === groupId && r.session.date <= today && isWithin(r.session.date, range)
  )
  const records = rows.flatMap((r) => r.records)
  const summary = summarize(records)
  const held = rows.filter((r) => r.session.status === "COMPLETED").length
  const cancelled = rows.filter((r) => r.session.status === "CANCELLED").length
  const pending = rows.filter((r) => r.progress.state === "NOT_RECORDED" || r.progress.state === "PARTIAL").length
  const members = students.filter((s) => s.groupId === groupId && s.status === "ACTIVE")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodFilter value={period} onChange={setPeriod} />
        <p className="text-sm text-muted-foreground">
          {countLabels.sessions(held)} منجزة ·{" "}
          {pending > 0 && <span className="text-warning">{countLabels.sessions(pending)} بحضور غير مكتمل · </span>}
          {countLabels.sessions(cancelled)} ملغاة
        </p>
      </div>

      <AttendanceStats summary={summary} extra={{ label: "الحصص المنجزة", value: held }} />

      <div className="grid gap-6 lg:grid-cols-5">
        <SectionCard title="سجل الحصص" icon={ClipboardList} className="lg:col-span-2">
          {rows.length === 0 ? (
            <EmptyState icon={ClipboardList} title="لا توجد حصص في هذه الفترة" className="py-6" />
          ) : (
            <ol className="-mx-2 max-h-[32rem] space-y-1 overflow-y-auto">
              {[...rows].reverse().map((r) => (
                <li key={r.session.id}>
                  <Link
                    href={`/admin/sessions/${r.session.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <span className="text-sm font-medium">
                      {labels.weekdayShort[weekdayOf(r.session.date)]} {formatShortDate(r.session.date)}
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
                    const s = summarize(records.filter((r) => r.studentId === student.id))
                    return (
                      <tr key={student.id}>
                        <td className="px-6 py-2">
                          <Link href={`/admin/students/${student.id}`} className="hover:opacity-80">
                            <PersonCell name={fullName(student)} photoUrl={student.photoUrl} size="sm" />
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
