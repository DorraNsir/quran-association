"use client"

import { CalendarCheck2, CalendarClock, CircleDashed, SearchX, UserX } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { AttendanceAction } from "@/components/sessions/attendance-action"
import { toSessionRow, type SessionRow } from "@/components/sessions/use-session-rows"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { useStudentsAttendanceSummary, type StudentSummaryLine } from "@/lib/api/attendance"
import { useStudents } from "@/lib/api/academic"
import { useSessionPage } from "@/lib/api/sessions"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { StatCard } from "@/components/shared/stat-card"
import { GroupBadge } from "@/components/shared/badges"
import { PersonCell } from "@/components/shared/user-avatar"
import { ATTENDANCE_STATUSES, countOf } from "@/lib/attendance"
import { todayInTunis, weekdayOf } from "@/lib/dates"
import { fullName, indexLookups, studentClass, type Lookups } from "@/lib/domain"
import { countLabels, formatShortDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { AttendanceStatus } from "@/types/domain"

import { AttendanceStateLabel } from "./attendance-badges"
import { useCurrentAcademicYear, usePlatformSettings } from "@/lib/store/settings"

type View = "sessions" | "students"
type StudentLine = StudentSummaryLine

/** Association-wide monitoring: which sessions still need attendance, who is absent, totals over a period. */
export function AttendanceOverview({ lookups }: { lookups: Lookups }) {
  const today = todayInTunis()
  const pageSize = usePlatformSettings().defaultPageSize
  const [view, setView] = useState<View>("sessions")
  const [period, setPeriod] = useState<Period>({ preset: "today" })
  const [groupId, setGroupId] = useState(ALL)
  const [branchId, setBranchId] = useState(ALL)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [page, setPage] = useState(1)
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  const currentYear = useCurrentAcademicYear()
  const range = resolvePeriod(period, today, currentYear)
  const indexes = indexLookups(lookups)
  // Monitoring looks at sessions that have happened (or happen today)
  const to = range.to && range.to < today ? range.to : today
  const valid = !range.from || range.from <= to
  const scope = {
    from: range.from,
    to,
    groupId: groupId === ALL ? undefined : groupId,
    branchId: branchId === ALL ? undefined : branchId,
  }
  const list = useSessionPage("admin", { ...scope, order: "desc" }, page, pageSize, valid)
  const completedCount = useSessionPage("admin", { ...scope, status: "COMPLETED" }, 1, 1, valid)
  const pendingCount = useSessionPage("admin", { ...scope, status: "SCHEDULED" }, 1, 1, valid)
  const lines = useStudentsAttendanceSummary(scope, valid)
  const complete = valid ? (completedCount.data?.meta.total ?? 0) : 0
  const pending = valid ? (pendingCount.data?.meta.total ?? 0) : 0
  const held = complete + pending
  const allLines = valid ? (lines.data ?? []) : []
  const students = useStudents()
  const studentClassById = new Map((students.data ?? []).map((st) => [st.id, st.groupClassId]))
  const absentStudents = allLines.filter((l) => l.absent > 0).length
  const absences = allLines.reduce((sum, l) => sum + l.absent, 0)

  // ── By session ──
  const sessionRows = valid ? (list.data?.data ?? []).map((s) => toSessionRow(s, today)) : []
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
        return <span className={cn("tabular-nums", s === "ABSENT" && value > 0 && "font-medium text-destructive")}>{r.summary.recorded ? value : "—"}</span>
      },
    })),
    { id: "action", header: <span className="sr-only">{labels.common.actions}</span>, cell: (r) => <AttendanceAction row={r} today={today} /> },
  ]

  // ── By student (counts over the period, from the API) ──
  const studentLines: StudentLine[] = allLines
    .filter((l) => !query.trim() || matchesText(`${l.firstName} ${l.lastName}`, query))
    .filter((l) => status === ALL || countOf(l, status as AttendanceStatus) > 0)
  const classOf = (studentId: string) => studentClassById.get(studentId)
  const studentColumns: Column<StudentLine>[] = [
    {
      id: "student",
      header: "الطالب",
      cell: (l) => (
        <Link href={`/admin/students/${l.studentId}`} className="block hover:opacity-80">
          <PersonCell name={fullName(l)} photoUrl={l.photoUrl ?? undefined} size="sm" />
        </Link>
      ),
    },
    {
      id: "group",
      header: "المجموعة والمدرس المشرف",
      className: "hidden lg:table-cell",
      cell: (l) => {
        const groupClassId = classOf(l.studentId)
        const v = groupClassId ? studentClass({ groupClassId }, indexes) : undefined
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
    { id: "recorded", header: "الحصص", className: "text-center", cell: (l) => <span className="tabular-nums">{l.recorded}</span> },
    ...(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const).map((s) => ({
      id: s,
      header: labels.attendance[s],
      className: "hidden text-center md:table-cell",
      cell: (l: StudentLine) => (
        <span className={cn("tabular-nums", s === "ABSENT" && l.absent > 0 && "font-medium text-destructive")}>
          {countOf(l, s)}
        </span>
      ),
    })),
    {
      id: "rate",
      header: "النسبة",
      className: "text-center",
      cell: (l) => (
        <span className={cn("font-medium tabular-nums", l.rate !== null && l.rate < 75 && "text-warning")}>
          {l.rate === null ? "—" : `${l.rate}%`}
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
    setPage(1)
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
        resultLabel={view === "sessions" ? countLabels.sessions(valid ? (list.data?.meta.total ?? 0) : 0) : countLabels.students(studentLines.length)}
        search={view === "students" ? <SearchInput value={query} onChange={setQuery} label="البحث عن طالب" placeholder="ابحث عن طالب…" /> : undefined}
      >
        <PeriodFilter value={period} onChange={resetPage(setPeriod)} />
        <FilterSelect label="المجموعة" allLabel="كل المجموعات" value={groupId} onValueChange={resetPage(setGroupId)}
          options={lookups.groups.filter((g) => g.status === "ACTIVE").map((g) => ({ value: g.id, label: g.name }))} />
        <FilterSelect label="الفرع" allLabel="كل الفروع" value={branchId} onValueChange={resetPage(setBranchId)}
          options={lookups.branches.filter((b) => b.status === "ACTIVE").map((b) => ({ value: b.id, label: b.name }))} />
        {view === "students" && (
          <FilterSelect label="حالة الحضور" allLabel="كل الحالات" value={status} onValueChange={setStatus}
            options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: `سُجّل ${labels.attendance[s]}` }))} />
        )}
      </FilterBar>

      <section aria-label="ملخص الفترة" className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="الحصص المبرمجة" value={held} icon={CalendarClock} hint={period.preset === "today" ? "اليوم" : undefined} />
        <StatCard label="حضور مكتمل" value={complete} icon={CalendarCheck2} />
        <StatCard label="حضور غير مكتمل" value={pending} icon={CircleDashed} href={pending > 0 ? "/admin/sessions?tab=pending" : undefined}
          className={cn(pending > 0 && "border-warning/40")} />
        <StatCard label="طلبة غائبون" value={absentStudents} icon={UserX} hint={`${absences} غياب غير مبرر`} />
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
        <QueryState query={list}>
        <DataTable
          key={`s|${period.preset}|${range.from}|${range.to}|${groupId}|${branchId}|${page}`}
          caption="حضور الحصص"
          columns={sessionColumns}
          rows={sessionRows}
          getRowId={(r) => r.session.id}
          emptyState={<EmptyState icon={SearchX} title={period.preset === "today" ? "لا توجد حصص اليوم" : "لا توجد حصص في هذه الفترة"} />}
        />
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
        </QueryState>
      ) : (
        <QueryState query={lines}>
        <DataTable
          key={`t|${period.preset}|${range.from}|${range.to}|${groupId}|${branchId}|${query}|${status}`}
          caption="حضور الطلبة"
          columns={studentColumns}
          rows={studentLines}
          getRowId={(l) => l.studentId}
          emptyState={<EmptyState icon={SearchX} title={status === "ABSENT" ? "لا توجد غيابات" : "لم يتم تسجيل الحضور بعد"} description="لا توجد سجلات حضور مطابقة في هذه الفترة." />}
        />
        </QueryState>
      )}
    </>
  )
}
