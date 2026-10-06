"use client"

import { BookMarked } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { fullName, indexLookups, studentClass, type Lookups } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { defaultPeriod, getMemorizationProgress, SEMESTERS } from "@/lib/memorization"
import { useOperations } from "@/lib/store/operations"
import { cn } from "@/lib/utils"
import type { AcademicYear, ID, ISODate, Student } from "@/types/domain"

import { MemorizationValue, useMemorizationDialog } from "./memorization-dialog"
import { AcademicYearSelect } from "./period-selectors"

/** A student's last memorized surah, one card per semester of the chosen year (not a timeline). */
export function StudentMemorization({
  studentId,
  lookups,
  students,
  academicYears,
  today,
}: {
  studentId: ID
  lookups: Lookups
  students: Student[]
  academicYears: AcademicYear[]
  today: ISODate
}) {
  const { memorizationProgress } = useOperations()
  const initial = defaultPeriod(academicYears, today)
  const [academicYearId, setAcademicYearId] = useState(initial.academicYearId)
  const memorization = useMemorizationDialog({ lookups, academicYears, today })
  const student = students.find((s) => s.id === studentId)
  if (!student) return null

  const indexes = indexLookups(lookups)
  const view = studentClass(student, indexes)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AcademicYearSelect value={academicYearId} onChange={setAcademicYearId} years={academicYears} />
        {view && (
          <p className="text-sm text-muted-foreground">
            {view.group?.name} · {view.branch?.name} · المدرس المشرف:{" "}
            <span className="font-medium text-foreground">{view.supervisor ? fullName(view.supervisor) : "—"}</span>
          </p>
        )}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {SEMESTERS.map((semester) => {
          const record = getMemorizationProgress(memorizationProgress, student.id, academicYearId, semester)
          const teacher = record ? indexes.teachersById.get(record.updatedByTeacherId) : undefined
          const isCurrent = academicYearId === initial.academicYearId && semester === initial.semester
          return (
            <li key={semester}>
              <Card className={cn("h-full gap-3 p-5", isCurrent && "border-primary/40")}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{labels.semester[semester]}</h3>
                  {isCurrent && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-soft-foreground">السداسي الحالي</span>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">آخر سورة محفوظة</p>
                  <MemorizationValue surah={record?.lastMemorizedSurah} className="text-lg" />
                </div>
                {record ? (
                  <p className="text-xs text-muted-foreground">
                    آخر تحديث: {formatDate(record.updatedAt)} · المدرس: {teacher ? fullName(teacher) : "—"}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">لم يتم تحديد آخر سورة محفوظة بعد</p>
                )}
                <Button size="sm" variant={record ? "outline" : "default"} className="mt-auto w-fit"
                  onClick={() => memorization.open(student, academicYearId, semester)}>
                  <BookMarked />
                  تحديث الحفظ
                </Button>
              </Card>
            </li>
          )
        })}
      </ul>
      {memorization.dialog}
    </div>
  )
}
