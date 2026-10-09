"use client"

import { BookMarked, DoorOpen } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { SectionCard } from "@/components/shared/info-list"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { classesOf, describeClass, fullName, indexLookups, type ClassView, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { defaultPeriod, indexMemorization, memorizationKey } from "@/lib/memorization"
import { useClassesMemorization } from "@/lib/api/memorization"
import type { ID, ISODate, MemorizationProgress, Semester, Student } from "@/types/domain"

import { MemorizationValue, useMemorizationDialog } from "./memorization-dialog"
import { AcademicYearSelect, SemesterSelect } from "./period-selectors"
import { useAcademicYears } from "@/lib/store/settings"

/** Last memorized surah of a group's students, CLASS BY CLASS (classes never mix). */
export function GroupMemorization({
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
  const academicYears = useAcademicYears()
  const initial = defaultPeriod(academicYears, today)
  // The years load asynchronously: until the user picks a period, the default (current) one applies
  const [pickedYearId, setAcademicYearId] = useState<string>()
  const [pickedSemester, setSemester] = useState<Semester>()
  const academicYearId = pickedYearId ?? initial.academicYearId
  const semester = pickedSemester ?? initial.semester
  const indexes = indexLookups(lookups)
  const classes = classesOf(groupId, lookups.groupClasses)
    .filter((c) => c.status !== "ARCHIVED")
    .map((c) => describeClass(c, indexes))
  const memo = useClassesMemorization("admin", classes.map((c) => c.groupClass.id), { academicYearId: academicYearId || undefined, semester })
  const memorization = useMemorizationDialog({ lookups, academicYears, records: memo.records })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <AcademicYearSelect value={academicYearId} onChange={setAcademicYearId} years={academicYears} />
        <SemesterSelect value={semester} onChange={setSemester} />
      </div>
      {classes.length === 0 ? (
        <EmptyState icon={DoorOpen} title="لا توجد أقسام لهذه المجموعة بعد" />
      ) : (
        classes.map((view) => (
          <ClassMemorization
            key={view.groupClass.id}
            view={view}
            students={students.filter((s) => s.groupClassId === view.groupClass.id && s.status === "ACTIVE")}
            academicYearId={academicYearId}
            semester={semester}
            records={memo.records}
            onUpdate={(student) => memorization.open(student, academicYearId, semester)}
          />
        ))
      )}
      {memorization.dialog}
    </div>
  )
}

function ClassMemorization({
  view,
  students,
  academicYearId,
  semester,
  records,
  onUpdate,
}: {
  view: ClassView
  students: Student[]
  academicYearId: ID
  semester: Semester
  records: MemorizationProgress[]
  onUpdate: (student: Student) => void
}) {
  const byKey = indexMemorization(records)
  const missing = students.filter((s) => !byKey.has(memorizationKey(s.id, academicYearId, semester))).length

  return (
    <SectionCard
      title={`${view.branch?.name ?? ""} · ${view.room?.name ?? ""}`}
      icon={DoorOpen}
      action={
        <span className="text-xs text-muted-foreground">
          المدرس المشرف: <span className="font-medium text-foreground">{view.supervisor ? fullName(view.supervisor) : "—"}</span> ·{" "}
          {countLabels.students(students.length)}
          {missing > 0 && <span className="text-warning"> · {missing} دون تحديد</span>}
        </span>
      }
    >
      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا يوجد طلبة نشطون في هذا القسم.</p>
      ) : (
        <ul className="divide-y">
          {students.map((student) => {
            const record = byKey.get(memorizationKey(student.id, academicYearId, semester))
            return (
              <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <Link href={`/admin/students/${student.id}?tab=memorization`} className="min-w-0 hover:opacity-80 sm:w-56">
                  <PersonCell name={fullName(student)} photoUrl={student.photoUrl} size="sm" />
                </Link>
                <MemorizationValue surah={record?.lastMemorizedSurah} className="flex-1 text-sm" />
                <Button size="sm" variant="ghost" onClick={() => onUpdate(student)} aria-label={`تحديث الحفظ: ${fullName(student)}`}>
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
}
