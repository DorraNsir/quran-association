"use client"

import { CalendarSearch, DoorOpen, Info, ShieldCheck, Users } from "lucide-react"
import Link from "next/link"
import { useQueries } from "@tanstack/react-query"
import { useState } from "react"

import { AttendanceStateLabel, SessionStatusBadge } from "@/components/attendance/attendance-badges"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { PeriodFilter, resolvePeriod, type Period } from "@/components/shared/period-filter"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { keys } from "@/lib/api/academic"
import { api, type Page } from "@/lib/api/client"
import { useSessionPage, type SessionDto, type SessionFilters } from "@/lib/api/sessions"
import { addDays, weekdayOf } from "@/lib/dates"
import { describeClass, fullName, indexLookups, type Lookups } from "@/lib/domain"
import { countLabels, formatShortDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { workspacePaths, type StaffWorkspace } from "@/lib/workspace"
import type { ISODate } from "@/types/domain"

import { AttendanceAction } from "./attendance-action"
import { GenerateSessionsButton } from "./generate-sessions-sheet"
import { toSessionRow, type SessionRow } from "./use-session-rows"
import { useCurrentAcademicYear, usePlatformSettings } from "@/lib/store/settings"

export type SessionTab = "today" | "pending" | "upcoming" | "done" | "cancelled" | "all"

const TABS: { value: SessionTab; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "pending", label: "حضور غير مكتمل" },
  { value: "upcoming", label: "القادمة" },
  { value: "done", label: "المنجزة" },
  { value: "cancelled", label: "الملغاة" },
  { value: "all", label: "الكل" },
]

/** Each tab is a server query (status + date bounds + order). */
function tabFilters(tab: SessionTab, today: ISODate): SessionFilters {
  switch (tab) {
    case "today":
      return { from: today, to: today, order: "asc" }
    case "pending":
      // Past/today lessons not completed yet: attendance missing or partial
      return { to: today, status: "SCHEDULED", order: "desc" }
    case "upcoming":
      return { from: addDays(today, 1), status: "SCHEDULED", order: "asc" }
    case "done":
      return { status: "COMPLETED", order: "desc" }
    case "cancelled":
      return { status: "CANCELLED", order: "desc" }
    default:
      return { order: "desc" }
  }
}

/** Tab bounds ∩ period bounds; null when they cannot overlap (no request then). */
function combine(tab: SessionFilters, range: { from?: ISODate; to?: ISODate }, extra: SessionFilters): SessionFilters | null {
  const from = [tab.from, range.from].filter(Boolean).sort().at(-1)
  const to = [tab.to, range.to].filter(Boolean).sort()[0]
  if (from && to && to < from) return null
  return { ...tab, ...extra, from, to }
}

export function SessionsView({
  lookups,
  today,
  initialTab = "today",
  workspace = "admin",
}: {
  /** Admin: every reference; teacher: the teacher's own classes (workspace bundle) */
  lookups: Lookups
  today: ISODate
  initialTab?: SessionTab
  workspace?: StaffWorkspace
}) {
  const isTeacher = workspace === "teacher"
  const paths = workspacePaths(workspace)
  const indexes = indexLookups(lookups)
  const pageSize = usePlatformSettings().defaultPageSize
  const [classId, setClassId] = useState(ALL)
  const [tab, setTab] = useState<SessionTab>(initialTab)
  const [period, setPeriod] = useState<Period>({ preset: "all" })
  const [groupId, setGroupId] = useState(ALL)
  const [branchId, setBranchId] = useState(ALL)
  const [teacherId, setTeacherId] = useState(ALL)
  const [page, setPage] = useState(1)
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  const currentYear = useCurrentAcademicYear()
  const range = resolvePeriod(period, today, currentYear)
  const extra: SessionFilters = {
    groupId: groupId === ALL ? undefined : groupId,
    groupClassId: classId === ALL ? undefined : classId,
    branchId: branchId === ALL ? undefined : branchId,
    teacherId: teacherId === ALL ? undefined : teacherId,
  }
  const filters = combine(tabFilters(tab, today), range, extra)
  const list = useSessionPage(workspace, filters ?? {}, page, pageSize, filters !== null)
  // Tab badges: totals of the same filters per tab (one small request each)
  const counts = useQueries({
    queries: TABS.map((t) => {
      const f = combine(tabFilters(t.value, today), range, extra)
      return {
        queryKey: [...keys.sessions, workspace, "count", t.value, f],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          api<Page<SessionDto>>(`/${workspace}/sessions`, { query: { ...f, page: 1, pageSize: 1 }, signal }),
        enabled: f !== null,
        select: (p: Page<SessionDto>) => p.meta.total,
      }
    }),
  })
  // Does ANY session exist (no filter)? Distinguishes "none generated yet" from "none match"
  const anySession = useSessionPage(workspace, {}, 1, 1)
  const noneGenerated = anySession.data?.meta.total === 0
  const rows = (list.data?.data ?? []).map((s) => toSessionRow(s, today))
  const total = filters === null ? 0 : (list.data?.meta.total ?? 0)

  const hasActiveFilters = period.preset !== "all" || [groupId, classId, branchId, teacherId].some((v) => v !== ALL)
  const resetFilters = () => {
    setPeriod({ preset: "all" })
    setClassId(ALL)
    setGroupId(ALL)
    setBranchId(ALL)
    setTeacherId(ALL)
    setPage(1)
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
      // The class's place tells apart two classes of the same group
      cell: (r) => (
        <Link href={paths.session(r.session.id)} className="block hover:opacity-80">
          <span className="font-medium">{r.group?.name}</span>
          <span className="block text-xs text-muted-foreground">
            {r.room?.name} · {r.branch?.name}
          </span>
        </Link>
      ),
    },
    {
      id: "supervisor",
      header: "المدرس المشرف",
      className: "hidden lg:table-cell",
      cell: (r) => <span className="text-sm">{r.supervisor ? fullName(r.supervisor) : "—"}</span>,
    },
    { id: "students", header: "الطلبة", cell: (r) => <span className="tabular-nums">{r.expected}</span> },
    { id: "attendance", header: "الحضور", cell: (r) => <AttendanceStateLabel {...r.progress} /> },
    { id: "status", header: "الحالة", cell: (r) => <SessionStatusBadge status={r.session.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">{labels.common.actions}</span>,
      // The group name already opens the session; the row's one action is attendance
      cell: (r) => <AttendanceAction row={r} today={today} workspace={workspace} />,
    },
  ]

  return (
    <>
      <PageHeader
        title={isTeacher ? "حصصي" : "الحصص"}
        description={
          isTeacher
            ? "حصص مجموعاتك المؤرخة مع حالة تسجيل الحضور لكل حصة."
            : "الحصص الفعلية المؤرخة، المتولدة من البرنامج الأسبوعي للمجموعات، مع حالة تسجيل الحضور لكل حصة."
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={paths.schedule}>{isTeacher ? "جدولي الأسبوعي" : "البرنامج الأسبوعي"}</Link>
            </Button>
            {!isTeacher && <GenerateSessionsButton lookups={lookups} today={today} />}
          </>
        }
      />

      {noneGenerated && (
        <Alert className="mb-4">
          <Info aria-hidden />
          <AlertTitle>{isTeacher ? "لا توجد حصص مؤرخة لك بعد" : "لم تُولَّد أي حصص بعد"}</AlertTitle>
          <AlertDescription>
            {isTeacher
              ? "تُنشئ الإدارة الحصص المؤرخة انطلاقًا من البرنامج الأسبوعي، وتظهر هنا بعد ذلك."
              : "المواعيد الأسبوعية هي البرنامج المتكرر فقط؛ الحصص الفعلية (التي يُسجَّل فيها الحضور) تُنشأ من هذا البرنامج عبر «توليد الحصص» للفترة المطلوبة."}
          </AlertDescription>
        </Alert>
      )}

      <div role="tablist" aria-label="تصنيف الحصص" className="mb-4 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
        {TABS.map((t, index) => {
          const count = combine(tabFilters(t.value, today), range, extra) === null ? 0 : counts[index].data
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => {
                setTab(t.value)
                setPage(1)
              }}
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
                  t.value === "pending" && (count ?? 0) > 0 && tab !== t.value && "bg-warning-soft text-warning"
                )}
              >
                {count ?? "…"}
              </span>
            </button>
          )
        })}
      </div>

      <FilterBar hasActiveFilters={hasActiveFilters} onReset={resetFilters} resultLabel={countLabels.sessions(total)}>
        <PeriodFilter value={period} onChange={resetPage(setPeriod)} />
        {isTeacher ? (
          // A teacher filters by their own classes only (group + branch)
          lookups.groupClasses.length > 1 && (
            <FilterSelect label="المجموعة" allLabel="كل مجموعاتي" value={classId} onValueChange={resetPage(setClassId)}
              options={lookups.groupClasses.map((groupClass) => {
                const view = describeClass(groupClass, indexes)
                return { value: groupClass.id, label: `${view.group?.name ?? ""} — ${view.branch?.name ?? ""}` }
              })} />
          )
        ) : (
          <>
            <FilterSelect label="المجموعة" allLabel="كل المجموعات" value={groupId} onValueChange={resetPage(setGroupId)}
              options={lookups.groups.filter((g) => g.status === "ACTIVE").map((g) => ({ value: g.id, label: g.name }))} />
            <FilterSelect label="الفرع" allLabel="كل الفروع" value={branchId} onValueChange={resetPage(setBranchId)}
              options={lookups.branches.filter((b) => b.status === "ACTIVE").map((b) => ({ value: b.id, label: b.name }))} />
            <FilterSelect label="المعلم" allLabel="كل المعلمين" value={teacherId} onValueChange={resetPage(setTeacherId)}
              options={lookups.teachers.filter((t) => t.status === "ACTIVE").map((t) => ({ value: t.id, label: fullName(t) }))} />
          </>
        )}
      </FilterBar>

      <QueryState query={list}>
      <DataTable
        key={`${tab}|${period.preset}|${range.from}|${range.to}|${groupId}|${classId}|${branchId}|${teacherId}|${page}`}
        caption="قائمة الحصص"
        columns={columns}
        rows={filters === null ? [] : rows}
        getRowId={(r) => r.session.id}
        emptyState={
          <EmptyState
            icon={CalendarSearch}
            title={
              noneGenerated
                ? "لم تُولَّد أي حصص بعد"
                : tab === "today"
                  ? "لا توجد حصص اليوم"
                  : tab === "pending"
                    ? "لا توجد حصص بحضور غير مكتمل"
                    : "لا توجد حصص مطابقة"
            }
            description={
              noneGenerated
                ? undefined
                : hasActiveFilters
                  ? "جرّب تغيير عوامل التصفية."
                  : tab === "today"
                    ? "اطّلع على الحصص القادمة أو على كل الحصص."
                    : undefined
            }
            action={noneGenerated && !isTeacher ? <GenerateSessionsButton lookups={lookups} today={today} variant="outline" /> : undefined}
          />
        }
        renderMobileCard={(r) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={paths.session(r.session.id)} className="min-w-0">
                <p className="font-medium">{r.group?.name}</p>
                {when(r)}
              </Link>
              <SessionStatusBadge status={r.session.status} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><DoorOpen className="size-3.5" aria-hidden />{r.room?.name} · {r.branch?.name}</span>
              {r.supervisor && <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" aria-hidden />{fullName(r.supervisor)}</span>}
              <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />{countLabels.students(r.expected)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <AttendanceStateLabel {...r.progress} />
              <AttendanceAction row={r} today={today} workspace={workspace} />
            </div>
          </div>
        )}
      />
      <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>
    </>
  )
}
