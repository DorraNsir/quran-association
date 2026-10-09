"use client"

import { BookMarked, SearchX } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { GroupBadge } from "@/components/shared/badges"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { PageHeader } from "@/components/shared/page-header"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { classesOf, describeClass, fullName, indexLookups, studentClass, type ClassView, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { defaultPeriod, indexMemorization, memorizationKey } from "@/lib/memorization"
import { useClassesMemorization } from "@/lib/api/memorization"
import type { ISODate, MemorizationProgress, Semester, Student } from "@/types/domain"

import { MemorizationValue, useMemorizationDialog } from "./memorization-dialog"
import { AcademicYearSelect, SemesterSelect } from "./period-selectors"
import { useAcademicYears, useAdminDate } from "@/lib/store/settings"

interface Row {
  student: Student
  /** Student → class → group, supervisor, branch */
  view?: ClassView
  record?: MemorizationProgress
}

/** One row per student: their last memorized surah for the chosen year and semester. */
export function MemorizationOverview({
  lookups,
  students,
  today,
}: {
  lookups: Lookups
  students: Student[]
  today: ISODate
}) {
  const adminDate = useAdminDate()
  const academicYears = useAcademicYears()
  const initial = defaultPeriod(academicYears, today)
  // The years load asynchronously: until the user picks a period, the default (current) one applies
  const [pickedYearId, setAcademicYearId] = useState<string>()
  const [pickedSemester, setSemester] = useState<Semester>()
  const academicYearId = pickedYearId ?? initial.academicYearId
  const semester = pickedSemester ?? initial.semester
  const [query, setQuery] = useState("")
  const [groupId, setGroupId] = useState(ALL)
  const [classId, setClassId] = useState(ALL)
  const [supervisorId, setSupervisorId] = useState(ALL)
  const [branchId, setBranchId] = useState(ALL)
  const [onlyMissing, setOnlyMissing] = useState(false)
  // Values of the classes the active students are in, for the selected semester
  const classIds = [...new Set(students.filter((s) => s.status === "ACTIVE" && s.groupClassId).map((s) => s.groupClassId))]
  const memo = useClassesMemorization("admin", classIds, { academicYearId: academicYearId || undefined, semester })
  const memorizationProgress = memo.records
  const memorization = useMemorizationDialog({ lookups, academicYears, records: memorizationProgress })

  const indexes = indexLookups(lookups)
  const byKey = indexMemorization(memorizationProgress)
  const rows: Row[] = students
    .filter((s) => s.status === "ACTIVE")
    .map((student) => ({
      student,
      view: studentClass(student, indexes),
      record: byKey.get(memorizationKey(student.id, academicYearId, semester)),
    }))
    .sort((a, b) => fullName(a.student).localeCompare(fullName(b.student), "ar"))
  const filtered = rows.filter(
    ({ student, view, record }) =>
      (!query.trim() || matchesText(fullName(student), query)) &&
      (groupId === ALL || view?.group?.id === groupId) &&
      (classId === ALL || student.groupClassId === classId) &&
      // Supervisor comes from the student's class, not from the group
      (supervisorId === ALL || view?.groupClass.supervisorId === supervisorId) &&
      (branchId === ALL || view?.groupClass.branchId === branchId) &&
      (!onlyMissing || !record)
  )
  const missing = filtered.filter((r) => !r.record).length
  const classLabel = (v?: ClassView) => (v ? `${v.branch?.name ?? ""} — ${v.supervisor ? fullName(v.supervisor) : "—"}` : "—")

  const hasActiveFilters = Boolean(query) || onlyMissing || [groupId, classId, supervisorId, branchId].some((v) => v !== ALL)
  const resetFilters = () => {
    setQuery("")
    setGroupId(ALL)
    setClassId(ALL)
    setSupervisorId(ALL)
    setBranchId(ALL)
    setOnlyMissing(false)
  }
  const updateButton = (r: Row) => (
    <Button size="sm" variant={r.record ? "outline" : "default"} onClick={() => memorization.open(r.student, academicYearId, semester)}
      aria-label={`تحديث الحفظ: ${fullName(r.student)}`}>
      <BookMarked />
      تحديث الحفظ
    </Button>
  )
  const updatedAt = (r: Row) =>
    r.record ? <span className="whitespace-nowrap tabular-nums text-muted-foreground">{adminDate(r.record.updatedAt)}</span> : <span className="text-muted-foreground">—</span>

  const columns: Column<Row>[] = [
    {
      id: "student",
      header: "الطالب",
      cell: (r) => (
        <Link href={`/admin/students/${r.student.id}?tab=memorization`} className="block hover:opacity-80">
          <PersonCell name={fullName(r.student)} photoUrl={r.student.photoUrl} size="sm" />
        </Link>
      ),
    },
    { id: "group", header: "المجموعة", cell: (r) => (r.view?.group ? <GroupBadge name={r.view.group.name} href={`/admin/groups/${r.view.group.id}`} /> : "—") },
    { id: "supervisor", header: "المدرس المشرف", cell: (r) => <span className="whitespace-nowrap">{r.view?.supervisor ? fullName(r.view.supervisor) : "—"}</span> },
    { id: "branch", header: "الفرع", className: "hidden xl:table-cell", cell: (r) => <span className="text-muted-foreground">{r.view?.branch?.name ?? "—"}</span> },
    { id: "surah", header: "آخر سورة محفوظة", cell: (r) => <MemorizationValue surah={r.record?.lastMemorizedSurah} /> },
    { id: "updated", header: "آخر تحديث", className: "hidden lg:table-cell", cell: updatedAt },
    { id: "actions", header: <span className="sr-only">الإجراءات</span>, cell: updateButton },
  ]

  return (
    <>
      <PageHeader title="متابعة الحفظ" description="متابعة آخر سورة محفوظة لكل طالب حسب السنة الدراسية والسداسي." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AcademicYearSelect value={academicYearId} onChange={setAcademicYearId} years={academicYears} />
        <SemesterSelect value={semester} onChange={setSemester} />
      </div>

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        resultLabel={`${countLabels.students(filtered.length)}${missing > 0 ? ` · ${missing} دون تحديد` : ""}`}
        search={<SearchInput value={query} onChange={setQuery} label="البحث عن طالب" placeholder="ابحث باسم الطالب…" />}
      >
        <FilterSelect label="المجموعة" allLabel="كل المجموعات" value={groupId}
          onValueChange={(v) => {
            setGroupId(v)
            setClassId(ALL)
          }}
          options={lookups.groups.filter((g) => g.status === "ACTIVE").map((g) => ({ value: g.id, label: g.name }))} />
        {groupId !== ALL && classesOf(groupId, lookups.groupClasses).length > 1 && (
          <FilterSelect label="القسم" allLabel="كل الأقسام" value={classId} onValueChange={setClassId}
            options={classesOf(groupId, lookups.groupClasses).map((c) => ({ value: c.id, label: classLabel(describeClass(c, indexes)) }))} />
        )}
        <FilterSelect label="المدرس المشرف" allLabel="كل المشرفين" value={supervisorId} onValueChange={setSupervisorId}
          options={lookups.teachers.filter((t) => lookups.groupClasses.some((c) => c.supervisorId === t.id)).map((t) => ({ value: t.id, label: fullName(t) }))} />
        <FilterSelect label="الفرع" allLabel="كل الفروع" value={branchId} onValueChange={setBranchId}
          options={lookups.branches.filter((b) => b.status === "ACTIVE").map((b) => ({ value: b.id, label: b.name }))} />
        <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm sm:col-span-1">
          <input type="checkbox" className="size-4 accent-primary" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          دون تحديد فقط
        </label>
      </FilterBar>

      <DataTable
        key={[academicYearId, semester, query, groupId, classId, supervisorId, branchId, onlyMissing].join("|")}
        caption="آخر سورة محفوظة لكل طالب"
        columns={columns}
        rows={filtered}
        getRowId={(r) => r.student.id}
        emptyState={
          rows.every((r) => !r.record) && !hasActiveFilters ? (
            <EmptyState icon={BookMarked} title="لم يتم تسجيل متابعة الحفظ لهذا السداسي بعد" />
          ) : (
            <EmptyState icon={SearchX} title="لا توجد نتائج مطابقة للفلاتر المحددة" />
          )
        }
        renderMobileCard={(r) => (
          <div className="space-y-2.5">
            <Link href={`/admin/students/${r.student.id}?tab=memorization`} className="block">
              <PersonCell name={fullName(r.student)} photoUrl={r.student.photoUrl} size="sm"
                secondary={`${r.view?.group?.name ?? ""} · ${classLabel(r.view)}`} />
            </Link>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">آخر سورة محفوظة</dt>
                <dd><MemorizationValue surah={r.record?.lastMemorizedSurah} /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">آخر تحديث</dt>
                <dd>{updatedAt(r)}</dd>
              </div>
            </dl>
            {updateButton(r)}
          </div>
        )}
      />
      {memorization.dialog}
    </>
  )
}
