"use client"

import { BookMarked, DoorOpen, ListChecks } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { MemorizationValue, useMemorizationDialog } from "@/components/memorization/memorization-dialog"
import { AcademicYearSelect, SemesterSelect } from "@/components/memorization/period-selectors"
import { TeacherRoleBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionCard } from "@/components/shared/info-list"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { fullName, type Lookups } from "@/lib/domain"
import { countLabels, formatShortDate } from "@/lib/format"
import { defaultPeriod, indexMemorization, memorizationKey } from "@/lib/memorization"
import { useOperations } from "@/lib/store/operations"
import { getTeacherGroupClasses } from "@/lib/teacher-access"
import type { ID, ISODate, Semester, Student } from "@/types/domain"
import { useAcademicYears } from "@/lib/store/settings"

/**
 * The teacher's memorization follow-up: their classes only, one list per
 * class, built for fast sequential updates ("save and next"). Same store
 * and same rule as the admin: one value per student, year and semester.
 */
export function TeacherMemorization({
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
  const { memorizationProgress } = useOperations()
  const initial = defaultPeriod(academicYears, today)
  const [academicYearId, setAcademicYearId] = useState(initial.academicYearId)
  const [semester, setSemester] = useState<Semester>(initial.semester)
  const [onlyMissing, setOnlyMissing] = useState(false)
  const memorization = useMemorizationDialog({ lookups, academicYears, today, updaterId: teacherId })
  const byKey = indexMemorization(memorizationProgress)
  const recordOf = (s: Student) => byKey.get(memorizationKey(s.id, academicYearId, semester))
  const classes = getTeacherGroupClasses(teacherId, lookups)
  const active = students.filter((s) => s.status === "ACTIVE")
  const missingTotal = active.filter((s) => !recordOf(s)).length
  const isCurrentPeriod = academicYearId === initial.academicYearId && semester === initial.semester

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <AcademicYearSelect value={academicYearId} onChange={setAcademicYearId} years={academicYears} />
        <SemesterSelect value={semester} onChange={setSemester} />
        <label className="flex cursor-pointer items-center gap-2 text-sm sm:ms-auto">
          <input type="checkbox" className="size-4 accent-primary" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          دون تحديد فقط ({missingTotal})
        </label>
      </div>
      {!isCurrentPeriod && (
        <p className="rounded-lg border border-warning/30 bg-warning-soft/40 px-3 py-2 text-sm">
          أنت تعرض سداسيًا غير السداسي الحالي — أي تحديث يُسجَّل لهذه الفترة فقط.
        </p>
      )}

      {classes.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={DoorOpen} title="لا توجد مجموعات مسندة إليك" />
        </Card>
      ) : (
        classes.map((assignment) => {
          const roster = active
            .filter((s) => s.groupClassId === assignment.groupClass.id)
            .sort((a, b) => fullName(a).localeCompare(fullName(b), "ar"))
          const shown = onlyMissing ? roster.filter((s) => !recordOf(s)) : roster
          const missing = roster.filter((s) => !recordOf(s)).length
          const start = roster.find((s) => !recordOf(s)) ?? roster[0]
          return (
            <SectionCard
              key={assignment.groupClass.id}
              title={`${assignment.group?.name ?? ""} — ${assignment.branch?.name ?? ""}`}
              icon={DoorOpen}
              action={
                start && (
                  <Button size="sm" variant="outline" onClick={() => memorization.open(start, academicYearId, semester, roster)}>
                    <ListChecks />
                    تحديث متتالي
                  </Button>
                )
              }
            >
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <TeacherRoleBadge role={assignment.role} />
                <span>{assignment.room?.name}</span>·<span>{countLabels.students(roster.length)}</span>
                {missing > 0 && <span className="text-warning">· {missing} دون تحديد</span>}
              </div>
              {shown.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {roster.length === 0 ? "لا يوجد طلبة نشطون في هذه المجموعة." : "تم تحديد الحفظ لكل الطلبة."}
                </p>
              ) : (
                <ul className="divide-y">
                  {shown.map((student) => {
                    const record = recordOf(student)
                    return (
                      <li key={student.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <Link href={`/teacher/students/${student.id}?tab=memorization`} className="min-w-0 flex-1 hover:opacity-80 sm:flex-none sm:w-56">
                          <PersonCell name={fullName(student)} photoUrl={student.photoUrl} size="sm"
                            secondary={<span className="sm:hidden"><MemorizationValue surah={record?.lastMemorizedSurah} /></span>} />
                        </Link>
                        <div className="hidden flex-1 text-sm sm:block">
                          <MemorizationValue surah={record?.lastMemorizedSurah} />
                          {record && <span className="ms-2 text-xs text-muted-foreground tabular-nums">{formatShortDate(record.updatedAt)}</span>}
                        </div>
                        <Button size="sm" variant={record ? "ghost" : "default"} className="shrink-0"
                          onClick={() => memorization.open(student, academicYearId, semester, roster)}
                          aria-label={`تحديث الحفظ: ${fullName(student)}`}>
                          <BookMarked />
                          تحديث
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </SectionCard>
          )
        })
      )}
      {memorization.dialog}
    </div>
  )
}
