"use client"

import { CalendarSearch, DoorOpen, ShieldCheck, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { AttendanceStateLabel, SessionStatusBadge } from "@/components/attendance/attendance-badges"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { Button } from "@/components/ui/button"
import { isWithin, weekdayOf } from "@/lib/dates"
import { fullName, groupTeacherIds, type Lookups } from "@/lib/domain"
import { countLabels, formatShortDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ISODate, Student } from "@/types/domain"

import { AttendanceAction } from "./attendance-action"
import { useSessionRows, type SessionRow } from "./use-session-rows"

export type SessionTab = "today" | "pending" | "upcoming" | "done" | "cancelled" | "all"

const TABS: { value: SessionTab; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "pending", label: "حضور غير مكتمل" },
  { value: "upcoming", label: "القادمة" },
  { value: "done", label: "المنجزة" },
  { value: "cancelled", label: "الملغاة" },
  { value: "all", label: "الكل" },
]

/** Which tab a session belongs to (a session can be both "today" and "pending"). */
function inTab(row: SessionRow, tab: SessionTab, today: ISODate) {
  const { session, progress } = row
  switch (tab) {
    case "today":
      return session.date === today
    case "pending":
      return session.date <= today && (progress.state === "NOT_RECORDED" || progress.state === "PARTIAL")
    case "upcoming":
      return session.date > today && session.status !== "CANCELLED"
    case "done":
      return session.status === "COMPLETED"
    case "cancelled":
      return session.status === "CANCELLED"
    default:
      return true
  }
}

export function SessionsView({
  lookups,
  students,
  today,
  initialTab = "today",
}: {
  lookups: Lookups
  students: Student[]
  today: ISODate
  initialTab?: SessionTab
}) {
  const rows = useSessionRows(lookups, students, today)
  const [tab, setTab] = useState<SessionTab>(initialTab)
  const [period, setPeriod] = useState<Period>({ preset: "all" })
  const [groupId, setGroupId] = useState(ALL)
  const [branchId, setBranchId] = useState(ALL)
  const [teacherId, setTeacherId] = useState(ALL)

  const range = resolvePeriod(period, today)
  const matchesFilters = (row: SessionRow) =>
    isWithin(row.session.date, range) &&
    (groupId === ALL || row.session.groupId === groupId) &&
    (branchId === ALL || row.session.branchId === branchId) &&
    (teacherId === ALL || (row.group ? groupTeacherIds(row.group).includes(teacherId) : false))
  const filteredAll = rows.filter(matchesFilters)
  const filtered = filteredAll.filter((r) => inTab(r, tab, today))
  // Future first-to-come; history most-recent first
  const ordered = tab === "today" || tab === "upcoming" ? filtered : [...filtered].reverse()

  const hasActiveFilters = period.preset !== "all" || [groupId, branchId, teacherId].some((v) => v !== ALL)
  const resetFilters = () => {
    setPeriod({ preset: "all" })
    setGroupId(ALL)
    setBranchId(ALL)
    setTeacherId(ALL)
  }

  const when = (row: SessionRow) => (
    <div className="whitespace-nowrap">
      <p className="font-medium">
        {labels.weekdayShort[weekdayOf(row.session.date)]} {formatShortDate(row.session.date)}
        {row.session.date === today && <span className="ms-1.5 text-xs text-primary">اليوم</span>}
      </p>
      <p className="text-xs tabular-nums text-muted-foreground">
        <span dir="ltr">{formatTimeRange(row.session.start, row.session.end)}</span>
      </p>
    </div>
  )

  const columns: Column<SessionRow>[] = [
    { id: "when", header: "الموعد", cell: when },
    {
      id: "group",
      header: "المجموعة",
      cell: (r) => (
        <Link href={`/admin/sessions/${r.session.id}`} className="font-medium hover:text-primary">
          {r.group?.name}
        </Link>
      ),
    },
    {
      id: "place",
      header: "المكان",
      className: "hidden xl:table-cell",
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.room?.name} · {r.branch?.name}
        </span>
      ),
    },
    {
      id: "supervisor",
      header: labels.teachingRole.SUPERVISOR,
      className: "hidden lg:table-cell",
      cell: (r) => <span className="text-sm">{r.supervisor ? fullName(r.supervisor) : "—"}</span>,
    },
    { id: "students", header: "الطلبة", cell: (r) => <span className="tabular-nums">{r.roster.length}</span> },
    { id: "attendance", header: "الحضور", cell: (r) => <AttendanceStateLabel {...r.progress} /> },
    { id: "status", header: "الحالة", cell: (r) => <SessionStatusBadge status={r.session.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">{labels.common.actions}</span>,
      // The group name already opens the session; the row's one action is attendance
      cell: (r) => <AttendanceAction row={r} today={today} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="الحصص"
        description="الحصص الفعلية المؤرخة، المتولدة من البرنامج الأسبوعي للمجموعات، مع حالة تسجيل الحضور لكل حصة."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/calendar">البرنامج الأسبوعي</Link>
          </Button>
        }
      />

      <div role="tablist" aria-label="تصنيف الحصص" className="mb-4 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {TABS.map((t) => {
          const count = filteredAll.filter((r) => inTab(r, t.value, today)).length
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  tab === t.value ? "bg-primary-foreground/20" : "bg-muted",
                  t.value === "pending" && count > 0 && tab !== t.value && "bg-warning-soft text-warning"
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <FilterBar hasActiveFilters={hasActiveFilters} onReset={resetFilters} resultLabel={countLabels.sessions(ordered.length)}>
        <PeriodFilter value={period} onChange={setPeriod} />
        <FilterSelect label="المجموعة" allLabel="كل المجموعات" value={groupId} onValueChange={setGroupId}
          options={lookups.groups.filter((g) => g.status === "ACTIVE").map((g) => ({ value: g.id, label: g.name }))} />
        <FilterSelect label="الفرع" allLabel="كل الفروع" value={branchId} onValueChange={setBranchId}
          options={lookups.branches.filter((b) => b.status === "ACTIVE").map((b) => ({ value: b.id, label: b.name }))} />
        <FilterSelect label="المعلم" allLabel="كل المعلمين" value={teacherId} onValueChange={setTeacherId}
          options={lookups.teachers.filter((t) => t.status === "ACTIVE").map((t) => ({ value: t.id, label: fullName(t) }))} />
      </FilterBar>

      <DataTable
        key={`${tab}|${period.preset}|${range.from}|${range.to}|${groupId}|${branchId}|${teacherId}`}
        caption="قائمة الحصص"
        columns={columns}
        rows={ordered}
        pageSize={15}
        getRowId={(r) => r.session.id}
        emptyState={
          <EmptyState
            icon={CalendarSearch}
            title={tab === "today" ? "لا توجد حصص اليوم" : tab === "pending" ? "لا توجد حصص بحضور غير مكتمل" : "لا توجد حصص مطابقة"}
            description={hasActiveFilters ? "جرّب تغيير عوامل التصفية." : undefined}
          />
        }
        renderMobileCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/admin/sessions/${r.session.id}`} className="min-w-0">
                <p className="font-medium">{r.group?.name}</p>
                {when(r)}
              </Link>
              <SessionStatusBadge status={r.session.status} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><DoorOpen className="size-3.5" aria-hidden />{r.room?.name} · {r.branch?.name}</span>
              {r.supervisor && <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" aria-hidden />{fullName(r.supervisor)}</span>}
              <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />{countLabels.students(r.roster.length)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <AttendanceStateLabel {...r.progress} />
              <AttendanceAction row={r} today={today} />
            </div>
          </div>
        )}
      />
    </>
  )
}
