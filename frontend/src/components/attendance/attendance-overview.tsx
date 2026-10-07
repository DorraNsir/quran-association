"use client"

import { CalendarCheck2, CalendarClock, CircleDashed, SearchX, UserX } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { AttendanceAction } from "@/components/sessions/attendance-action"
import { useSessionRows, type SessionRow } from "@/components/sessions/use-session-rows"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { StatCard } from "@/components/shared/stat-card"
import { GroupBadge } from "@/components/shared/badges"
import { PersonCell } from "@/components/shared/user-avatar"
import { ATTENDANCE_STATUSES, countOf, summarize, type AttendanceSummary } from "@/lib/attendance"
import { isWithin, weekdayOf } from "@/lib/dates"
import { fullName, indexLookups, studentClass, type Lookups } from "@/lib/domain"
import { countLabels, formatShortDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AttendanceStatus, ISODate, Student } from "@/types/domain"

import { AttendanceStateLabel } from "./attendance-badges"
import { useCurrentAcademicYear } from "@/lib/store/settings"

type View = "sessions" | "students"

interface StudentLine {
  student: Student
  summary: AttendanceSummary
}

/** Association-wide monitoring: which sessions still need attendance, who is absent, yearly totals. */
export function AttendanceOverview({ lookups, students, today }: { lookups: Lookups; students: Student[]; today: ISODate }) {
  const rows = useSessionRows(lookups, students, today)
  const [view, setView] = useState<View>("sessions")
  const [period, setPeriod] = useState<Period>({ preset: "today" })
  const [groupId, setGroupId] = useState(ALL)
  const [branchId, setBranchId] = useState(ALL)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)

  const currentYear = useCurrentAcademicYear()

  const range = resolvePeriod(period, today, currentYear)
  const indexes = indexLookups(lookups)
  // Monitoring looks at sessions that have happened (or happen today)
  const inScope = rows.filter(
    (r) =>
      r.session.date <= today &&
      isWithin(r.session.date, range) &&
      (groupId === ALL || r.group?.id === groupId) &&
      (branchId === ALL || r.branch?.id === branchId)
  )
  const held = inScope.filter((r) => r.session.status !== "CANCELLED")
  const complete = held.filter((r) => r.progress.state === "COMPLETE").length
  const pending = held.length - complete
  const records = held.flatMap((r) => r.records)
  const absentStudents = new Set(records.filter((r) => r.status === "ABSENT").map((r) => r.studentId)).size

  // ── By session ──
  const sessionRows = [...held]
    .filter((r) => !query.trim() || r.roster.some((s) => matchesText(fullName(s), query)))
    .reverse()
  const sessionColumns: Column<SessionRow>[] = [
    {
      id: "when",
      header: "الحصة",
      cell: (r) => (
        <Link href={`/admin/sessions/${r.session.id}`} className="block hover:opacity-80">
          <p className="font-medium">{r.group?.name}</p>
          {/* Class context: two classes of one group can meet the same day */}
          <p className="text-xs text-muted-foreground">
            {r.branch?.name} — {r.supervisor ? fullName(r.supervisor) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {labels.weekdayShort[weekdayOf(r.session.date)]} {formatShortDate(r.session.date)} ·{" "}
            <span dir="ltr" className="tabular-nums">{formatTimeRange(r.session.start, r.session.end)}</span>
          </p>
        </Link>
      ),
    },
    { id: "state", header: "التسجيل", cell: (r) => <AttendanceStateLabel {...r.progress} /> },
    ...(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((s) => ({
      id: s,
      header: labels.attendance[s],
      className: "hidden text-center md:table-cell",
      cell: (r: SessionRow) => {
        const value = countOf(r.summary, s)
        return <span className={cn("tabular-nums", s === "ABSENT" && value > 0 && "font-medium text-destructive")}>{r.records.length ? value : "—"}</span>
      },
    })),
    { id: "action", header: <span className="sr-only">{labels.common.actions}</span>, cell: (r) => <AttendanceAction row={r} today={today} /> },
  ]

  // ── By student (end-of-year counts) ──
  const studentLines: StudentLine[] = students
    .filter(
      (s) =>
        (groupId === ALL || studentClass(s, indexes)?.group?.id === groupId) &&
        (branchId === ALL || studentClass(s, indexes)?.branch?.id === branchId) &&
        (!query.trim() || matchesText(fullName(s), query))
    )
    .map((student) => ({ student, summary: summarize(records.filter((r) => r.studentId === student.id)) }))
    .filter((l) => l.summary.recorded > 0)
    .filter((l) => status === ALL || countOf(l.summary, status as AttendanceStatus) > 0)
    .sort((a, b) => b.summary.absent - a.summary.absent || fullName(a.student).localeCompare(fullName(b.student), "ar"))
  const studentColumns: Column<StudentLine>[] = [
    {
      id: "student",
      header: "الطالب",
      cell: ({ student }) => (
        <Link href={`/admin/students/${student.id}`} className="block hover:opacity-80">
          <PersonCell name={fullName(student)} photoUrl={student.photoUrl} size="sm" />
        </Link>
      ),
    },
    {
      id: "group",
      header: "المجموعة والمدرس المشرف",
      className: "hidden lg:table-cell",
      cell: ({ student }) => {
        const v = studentClass(student, indexes)
        return v?.group ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <GroupBadge name={v.group.name} href={`/admin/groups/${v.group.id}`} />
            <span className="text-xs text-muted-foreground">
              {v.branch?.name} — {v.supervisor ? fullName(v.supervisor) : "—"}
            </span>
          </div>
        ) : (
          "—"
        )
      },
    },
    { id: "recorded", header: "الحصص", className: "text-center", cell: (l) => <span className="tabular-nums">{l.summary.recorded}</span> },
    ...(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((s) => ({
      id: s,
      header: labels.attendance[s],
      className: "hidden text-center md:table-cell",
      cell: (l: StudentLine) => (
        <span className={cn("tabular-nums", s === "ABSENT" && l.summary.absent > 0 && "font-medium text-destructive")}>
          {countOf(l.summary, s)}
        </span>
      ),
    })),
    {
      id: "rate",
      header: "النسبة",
      className: "text-center",
      cell: (l) => (
        <span className={cn("font-medium tabular-nums", l.summary.rate !== null && l.summary.rate < 75 && "text-warning")}>
          {l.summary.rate === null ? "—" : `${l.summary.rate}%`}
        </span>
      ),
    },
  ]

  const hasActiveFilters = period.preset !== "today" || [groupId, branchId, status].some((v) => v !== ALL) || Boolean(query)
  const resetFilters = () => {
    setPeriod({ preset: "today" })
    setGroupId(ALL)
    setBranchId(ALL)
    setStatus(ALL)
    setQuery("")
  }

  return (
    <>
      <PageHeader
        title="متابعة الحضور"
        description="نظرة إدارية على تسجيل الحضور في كل المجموعات: الحصص التي تنتظر التسجيل، الغيابات، ومجموع حضور كل طالب على أي فترة."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        resultLabel={view === "sessions" ? countLabels.sessions(sessionRows.length) : countLabels.students(studentLines.length)}
        search={<SearchInput value={query} onChange={setQuery} label="البحث عن طالب" placeholder="ابحث عن طالب…" />}
      >
        <PeriodFilter value={period} onChange={setPeriod} />
        <FilterSelect label="المجموعة" allLabel="كل المجموعات" value={groupId} onValueChange={setGroupId}
          options={lookups.groups.filter((g) => g.status === "ACTIVE").map((g) => ({ value: g.id, label: g.name }))} />
        <FilterSelect label="الفرع" allLabel="كل الفروع" value={branchId} onValueChange={setBranchId}
          options={lookups.branches.filter((b) => b.status === "ACTIVE").map((b) => ({ value: b.id, label: b.name }))} />
        {view === "students" && (
          <FilterSelect label="حالة الحضور" allLabel="كل الحالات" value={status} onValueChange={setStatus}
            options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: `سُجّل ${labels.attendance[s]}` }))} />
        )}
      </FilterBar>

      <section aria-label="ملخص الفترة" className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="الحصص المبرمجة" value={held.length} icon={CalendarClock} hint={period.preset === "today" ? "اليوم" : undefined} />
        <StatCard label="حضور مكتمل" value={complete} icon={CalendarCheck2} />
        <StatCard label="حضور غير مكتمل" value={pending} icon={CircleDashed} href={pending > 0 ? "/admin/sessions?tab=pending" : undefined}
          className={cn(pending > 0 && "border-warning/40")} />
        <StatCard label="طلبة غائبون" value={absentStudents} icon={UserX} hint={`${records.filter((r) => r.status === "ABSENT").length} غياب غير مبرر`} />
      </section>

      <div role="tablist" aria-label="طريقة العرض" className="mb-4 inline-flex rounded-lg border bg-card p-1">
        {([["sessions", "حسب الحصة"], ["students", "حسب الطالب"]] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
            className={cn("rounded-md px-4 py-1.5 text-sm transition-colors", view === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {label}
          </button>
        ))}
      </div>

      {view === "sessions" ? (
        <DataTable
          key={`s|${period.preset}|${range.from}|${range.to}|${groupId}|${branchId}|${query}`}
          caption="حضور الحصص"
          columns={sessionColumns}
          rows={sessionRows}
          getRowId={(r) => r.session.id}
          emptyState={<EmptyState icon={SearchX} title={period.preset === "today" ? "لا توجد حصص اليوم" : "لا توجد حصص في هذه الفترة"} />}
        />
      ) : (
        <DataTable
          key={`t|${period.preset}|${range.from}|${range.to}|${groupId}|${branchId}|${query}|${status}`}
          caption="حضور الطلبة"
          columns={studentColumns}
          rows={studentLines}
          getRowId={(l) => l.student.id}
          emptyState={<EmptyState icon={SearchX} title={status === "ABSENT" ? "لا توجد غيابات" : "لم يتم تسجيل الحضور بعد"} description="لا توجد سجلات حضور مطابقة في هذه الفترة." />}
        />
      )}
    </>
  )
}
