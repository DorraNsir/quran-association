"use client"

import { GraduationCap, NotebookPen, SearchX } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { MemorizationValue } from "@/components/memorization/memorization-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { PersonCell } from "@/components/shared/user-avatar"
import { fullName, indexLookups, studentClass, type ClassView, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { defaultPeriod, indexMemorization, memorizationKey } from "@/lib/memorization"
import { useTeacherStudentRates } from "@/lib/api/attendance"
import { useClassesMemorization } from "@/lib/api/memorization"
import { useTeacherNotes } from "@/lib/api/teacher-notes"
import { getTeacherGroupClasses } from "@/lib/teacher-access"
import type { ID, ISODate, MemorizationProgress, Student } from "@/types/domain"

import { useAcademicYears } from "@/lib/store/settings"

interface Row {
  student: Student
  view?: ClassView
  record?: MemorizationProgress
  rate: number | null
  notes: number
}

/** The students of the teacher's classes only, with their key follow-up figures. */
export function TeacherStudentsView({
  teacherId,
  lookups,
  students,
  today,
}: {
  teacherId: ID
  lookups: Lookups
  /** The teacher's own students */
  students: Student[]
  today: ISODate
}) {
  const academicYears = useAcademicYears()
  const [query, setQuery] = useState("")
  const [classId, setClassId] = useState(ALL)
  const classes = getTeacherGroupClasses(teacherId, lookups)
  const indexes = indexLookups(lookups)
  const period = defaultPeriod(academicYears, today)
  const memo = useClassesMemorization("teacher", classes.map((a) => a.groupClass.id), {
    academicYearId: period.academicYearId || undefined,
    semester: period.semester,
  })
  const byKey = indexMemorization(memo.records)
  const myNotes = useTeacherNotes(teacherId).data ?? []
  const active = students.filter((s) => s.status === "ACTIVE")
  const rates = useTeacherStudentRates(active.map((s) => s.id))

  const rows: Row[] = active
    .map((student) => ({
      student,
      view: studentClass(student, indexes),
      record: byKey.get(memorizationKey(student.id, period.academicYearId, period.semester)),
      rate: rates.get(student.id) ?? null,
      notes: myNotes.filter((n) => n.studentId === student.id).length,
    }))
    .sort((a, b) => fullName(a.student).localeCompare(fullName(b.student), "ar"))
  const filtered = rows.filter(
    (r) => (!query.trim() || matchesText(fullName(r.student), query)) && (classId === ALL || r.student.groupClassId === classId)
  )
  const classLabel = (v?: ClassView) => (v ? `${v.group?.name ?? ""} — ${v.branch?.name ?? ""}` : "—")
  const rate = (r: Row) => <span className="tabular-nums">{r.rate === null ? "—" : `${r.rate}%`}</span>
  const notes = (r: Row) =>
    r.notes > 0 ? (
      <span className="inline-flex items-center gap-1 text-muted-foreground"><NotebookPen className="size-3.5" aria-hidden />{r.notes}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    )
  const href = (r: Row) => `/teacher/students/${r.student.id}`

  const columns: Column<Row>[] = [
    {
      id: "student",
      header: "الطالب",
      cell: (r) => (
        <Link href={href(r)} className="block hover:opacity-80">
          <PersonCell name={fullName(r.student)} photoUrl={r.student.photoUrl} size="sm" />
        </Link>
      ),
    },
    { id: "class", header: "المجموعة", cell: (r) => <span className="whitespace-nowrap">{classLabel(r.view)}</span> },
    { id: "surah", header: `آخر سورة محفوظة (${labels.semester[period.semester]})`, cell: (r) => <MemorizationValue surah={r.record?.lastMemorizedSurah} /> },
    { id: "rate", header: "نسبة الحضور", cell: rate },
    { id: "notes", header: "ملاحظاتي", className: "hidden lg:table-cell", cell: notes },
  ]

  return (
    <>
      <FilterBar
        hasActiveFilters={Boolean(query) || classId !== ALL}
        onReset={() => {
          setQuery("")
          setClassId(ALL)
        }}
        resultLabel={countLabels.students(filtered.length)}
        search={<SearchInput value={query} onChange={setQuery} label="البحث عن طالب" placeholder="ابحث باسم الطالب…" />}
      >
        {classes.length > 1 && (
          <FilterSelect label="المجموعة" allLabel="كل مجموعاتي" value={classId} onValueChange={setClassId}
            options={classes.map((a) => ({ value: a.groupClass.id, label: classLabel(a) }))} />
        )}
      </FilterBar>

      <DataTable
        key={`${query}|${classId}`}
        caption="طلابي"
        columns={columns}
        rows={filtered}
        getRowId={(r) => r.student.id}
        emptyState={
          rows.length === 0 ? (
            <EmptyState icon={GraduationCap} title="لا يوجد طلبة في مجموعاتك" />
          ) : (
            <EmptyState icon={SearchX} title="لا يوجد طالب مطابق" />
          )
        }
        renderMobileCard={(r) => (
          <Link href={href(r)} className="block space-y-2.5">
            <PersonCell name={fullName(r.student)} photoUrl={r.student.photoUrl} size="sm" secondary={classLabel(r.view)} />
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">آخر سورة محفوظة</dt>
                <dd><MemorizationValue surah={r.record?.lastMemorizedSurah} /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">الحضور</dt>
                <dd>{rate(r)}</dd>
              </div>
            </dl>
          </Link>
        )}
      />
    </>
  )
}
