"use client"

import { GraduationCap, SearchX, UserRound } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { QueryState } from "@/components/shared/query-state"
import { PersonCell } from "@/components/shared/user-avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  useStudentsAttendanceSummary,
  useTeachersAttendanceSummary,
  type AttendanceTotals,
  type SummaryFilters,
} from "@/lib/api/attendance"
import { todayInTunis } from "@/lib/dates"
import { describeClass, fullName, indexLookups, type Lookups } from "@/lib/domain"
import { countLabels, formatMonthName } from "@/lib/format"
import { useAcademicYears } from "@/lib/store/settings"
import { cn } from "@/lib/utils"

import { monthRange } from "./attendance-period-stats"

type Who = "students" | "teachers"

interface Line {
  id: string
  firstName: string
  lastName: string
  photoUrl: string | null
  month?: AttendanceTotals
  year?: AttendanceTotals
}

/** Merges the month's and the year's lines (one API call each) by person. */
function mergeLines<T extends AttendanceTotals & { firstName: string; lastName: string; photoUrl: string | null }>(
  idOf: (l: T) => string,
  month: T[],
  year: T[]
): Line[] {
  const byId = new Map<string, Line>()
  for (const [key, lines] of [["month", month], ["year", year]] as const)
    for (const l of lines) {
      const id = idOf(l)
      const line = byId.get(id) ?? { id, firstName: l.firstName, lastName: l.lastName, photoUrl: l.photoUrl }
      line[key] = l
      byId.set(id, line)
    }
  return [...byId.values()].sort(
    (a, b) => a.lastName.localeCompare(b.lastName, "ar") || a.firstName.localeCompare(b.firstName, "ar")
  )
}

/**
 * «إحصائيات الحضور»: per student or per teacher, the month's and the academic
 * year's attendance (attended / counted sessions and rate) — computed by the
 * API with the single attendance rule; filters narrow the SESSIONS counted.
 */
export function AttendanceStatistics({ lookups }: { lookups: Lookups }) {
  const today = todayInTunis()
  const years = useAcademicYears()
  const indexes = indexLookups(lookups)
  const [who, setWho] = useState<Who>("students")
  const [month, setMonth] = useState(() => ({ year: +today.slice(0, 4), month: +today.slice(5, 7) }))
  const [yearId, setYearId] = useState<string | undefined>(undefined)
  const [branchId, setBranchId] = useState(ALL)
  const [groupId, setGroupId] = useState(ALL)
  const [groupClassId, setGroupClassId] = useState(ALL)
  const [teacherId, setTeacherId] = useState(ALL)
  const [query, setQuery] = useState("")
  const academicYear = years.find((y) => y.id === yearId) ?? years.find((y) => y.isCurrent) ?? years[0]

  const scope: SummaryFilters = {
    branchId: branchId === ALL ? undefined : branchId,
    groupId: groupId === ALL ? undefined : groupId,
    groupClassId: groupClassId === ALL ? undefined : groupClassId,
    teacherId: teacherId === ALL ? undefined : teacherId,
  }
  const monthFilter = { ...scope, ...monthRange(month.year, month.month) }
  const yearFilter = { ...scope, from: academicYear?.startDate, to: academicYear?.endDate }
  const students = who === "students"
  const studentsMonth = useStudentsAttendanceSummary(monthFilter, students)
  const studentsYear = useStudentsAttendanceSummary(yearFilter, students && Boolean(academicYear))
  const teachersMonth = useTeachersAttendanceSummary(monthFilter, !students)
  const teachersYear = useTeachersAttendanceSummary(yearFilter, !students && Boolean(academicYear))
  const monthQuery = students ? studentsMonth : teachersMonth
  const yearQuery = students ? studentsYear : teachersYear

  const lines = (
    students
      ? mergeLines((l) => l.studentId, studentsMonth.data ?? [], studentsYear.data ?? [])
      : mergeLines((l) => l.teacherId, teachersMonth.data ?? [], teachersYear.data ?? [])
  ).filter((l) => !query.trim() || matchesText(fullName(l), query))

  const classOptions = lookups.groupClasses
    .filter((c) => (groupId === ALL || c.groupId === groupId) && (branchId === ALL || c.branchId === branchId))
    .map((c) => {
      const view = describeClass(c, indexes)
      return { value: c.id, label: `${view.group?.name ?? "—"} — ${view.branch?.name ?? ""}` }
    })
  const calendarYears = [
    ...new Set([+today.slice(0, 4), ...years.flatMap((y) => [+y.startDate.slice(0, 4), +y.endDate.slice(0, 4)])]),
  ].sort((a, b) => b - a)
  const monthLabel = `${formatMonthName(month.month)} ${month.year}`

  const fraction = (t?: AttendanceTotals) => (
    <span className="tabular-nums" dir="ltr">
      {t ? `${t.attended} / ${t.eligible}` : "0 / 0"}
    </span>
  )
  const rate = (t?: AttendanceTotals) => {
    const value = t?.rate ?? null
    return (
      <span className={cn("font-medium tabular-nums", value !== null && value < 75 && "text-warning")}>
        {value === null ? "—" : `${value}%`}
      </span>
    )
  }
  const columns: Column<Line>[] = [
    {
      id: "person",
      header: students ? "الطالب" : "المعلم",
      cell: (l) => (
        <Link href={`/admin/${who}/${l.id}`} className="block hover:opacity-80">
          <PersonCell name={fullName(l)} photoUrl={l.photoUrl ?? undefined} size="sm" />
        </Link>
      ),
    },
    { id: "month", header: `حضور ${monthLabel}`, className: "text-center", cell: (l) => fraction(l.month) },
    { id: "monthRate", header: "نسبة الشهر", className: "text-center", cell: (l) => rate(l.month) },
    {
      id: "monthAbsent",
      header: "غياب الشهر",
      className: "hidden text-center md:table-cell",
      cell: (l) => (
        <span className={cn("tabular-nums", (l.month?.absent ?? 0) > 0 && "font-medium text-destructive")}>{l.month?.absent ?? 0}</span>
      ),
    },
    {
      id: "monthExcused",
      header: "غياب مبرر",
      className: "hidden text-center md:table-cell",
      cell: (l) => <span className="tabular-nums">{l.month?.excused ?? 0}</span>,
    },
    { id: "year", header: "حضور السنة", className: "text-center", cell: (l) => fraction(l.year) },
    { id: "yearRate", header: "نسبة السنة", className: "text-center", cell: (l) => rate(l.year) },
  ]

  const hasActiveFilters = [branchId, groupId, groupClassId, teacherId].some((v) => v !== ALL) || Boolean(query)
  const resetFilters = () => {
    setBranchId(ALL)
    setGroupId(ALL)
    setGroupClassId(ALL)
    setTeacherId(ALL)
    setQuery("")
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="إحصائيات" className="inline-flex rounded-lg border bg-card p-1">
        {([["students", "الطلبة", GraduationCap], ["teachers", "المعلمون", UserRound]] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" role="tab" aria-selected={who === value} onClick={() => setWho(value)}
            className={cn("flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm transition-colors", who === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        resultLabel={students ? countLabels.students(lines.length) : countLabels.teachers(lines.length)}
        search={<SearchInput value={query} onChange={setQuery} label={students ? "البحث عن طالب" : "البحث عن معلم"} placeholder="ابحث بالاسم…" />}
      >
        <Select value={String(month.month)} onValueChange={(m) => setMonth((p) => ({ ...p, month: +m }))}>
          <SelectTrigger aria-label="الشهر" className="w-full bg-background sm:w-auto sm:min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={String(m)}>
                {formatMonthName(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(month.year)} onValueChange={(y) => setMonth((p) => ({ ...p, year: +y }))}>
          <SelectTrigger aria-label="سنة الشهر" className="w-full bg-background sm:w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {calendarYears.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {years.length > 0 && academicYear && (
          <Select value={academicYear.id} onValueChange={setYearId}>
            <SelectTrigger aria-label="السنة الدراسية" className="w-full bg-background sm:w-auto sm:min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  السنة الدراسية {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <FilterSelect label="الفرع" allLabel="كل الفروع" value={branchId} onValueChange={(v) => { setBranchId(v); setGroupClassId(ALL) }}
          options={lookups.branches.map((b) => ({ value: b.id, label: b.name }))} />
        <FilterSelect label="المجموعة" allLabel="كل المجموعات" value={groupId} onValueChange={(v) => { setGroupId(v); setGroupClassId(ALL) }}
          options={lookups.groups.map((g) => ({ value: g.id, label: g.name }))} />
        <FilterSelect label="القسم" allLabel="كل الأقسام" value={groupClassId} onValueChange={setGroupClassId} options={classOptions} />
        <FilterSelect label="المعلم" allLabel="كل المعلمين" value={teacherId} onValueChange={setTeacherId}
          options={lookups.teachers.map((t) => ({ value: t.id, label: fullName(t) }))} />
      </FilterBar>

      <QueryState query={academicYear ? [monthQuery, yearQuery] : monthQuery}>
        <DataTable
          key={`${who}|${month.year}-${month.month}|${academicYear?.id}|${branchId}|${groupId}|${groupClassId}|${teacherId}|${query}`}
          caption={students ? "إحصائيات حضور الطلبة" : "إحصائيات حضور المعلمين"}
          columns={columns}
          rows={lines}
          getRowId={(l) => l.id}
          emptyState={<EmptyState icon={SearchX} title="لا توجد سجلات حضور" description="لا توجد سجلات حضور مطابقة لهذه الفترة والفلاتر." />}
        />
      </QueryState>
      <p className="text-xs text-muted-foreground">
        النسبة = (حاضر + متأخر) ÷ (حاضر + متأخر + غائب). الغياب المبرر لا يُحتسب، ولا تُحتسب الحصص غير المسجّلة أو الملغاة أو القادمة.
        {!academicYear && " لا توجد سنة دراسية حالية: عمود السنة فارغ."}
        {teacherId !== ALL && " مع فلتر المعلم: تُحتسب الحصص التي درّسها هذا المعلم فقط."}
      </p>
    </div>
  )
}
