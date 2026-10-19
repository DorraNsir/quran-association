"use client"

import { BookMarked, CalendarSearch } from "lucide-react"
import { useState } from "react"

import { MemorizationValue, useMemorizationDialog } from "@/components/memorization/memorization-dialog"
import { AcademicYearSelect, SemesterSelect } from "@/components/memorization/period-selectors"
import { StatusBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionCard } from "@/components/shared/info-list"
import { QueryState } from "@/components/shared/query-state"
import { PersonCell } from "@/components/shared/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/errors"
import { useSessionMemorization, type SessionMemorizationDto } from "@/lib/api/memorization"
import { fullName, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { useAcademicYears } from "@/lib/store/settings"
import type { StaffWorkspace } from "@/lib/workspace"
import type { AcademicYear, ID, Semester, Student } from "@/types/domain"

import type { SessionRow } from "./use-session-rows"

/**
 * «متابعة الحفظ» of a SHARED lesson: one combined list of its students, each
 * with their own program and their own last memorized surah for the period
 * (default: the semester of the lesson date). Read from the lesson endpoint;
 * every update uses the usual memorization dialog and per-student endpoint
 * (one record per student and semester — the API checks the teacher's access:
 * an assistant only sees and updates the students of their own classes).
 */
export function SessionMemorizationPanel({ row, workspace }: { row: SessionRow; workspace: StaffWorkspace }) {
  const years = useAcademicYears()
  const [picked, setPicked] = useState<{ academicYearId: ID; semester: Semester }>()
  const query = useSessionMemorization(workspace, row.session.id, picked)
  const data = query.data
  const academicYearId = picked?.academicYearId ?? data?.academicYear.id ?? ""
  const semester = picked?.semester ?? data?.uiSemester ?? "SEMESTER_1"
  // The lesson's own year is always selectable (a teacher's list holds only the current one)
  const academicYears: AcademicYear[] =
    data && !years.some((y) => y.id === data.academicYear.id) ? [...years, yearOf(data)] : years
  const students = (data?.students ?? []).map(toStudent)
  const memorization = useMemorizationDialog({
    lookups: lookupsOf(row, data),
    academicYears,
    records: data?.records ?? [],
    scope: workspace,
  })
  const noYear = query.error instanceof ApiError && query.error.isNotFound && !picked

  return (
    <SectionCard
      title="متابعة الحفظ"
      icon={BookMarked}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <AcademicYearSelect
            value={academicYearId}
            onChange={(id) => setPicked({ academicYearId: id, semester })}
            years={academicYears}
          />
          <SemesterSelect
            value={semester}
            onChange={(s) => academicYearId && setPicked({ academicYearId, semester: s })}
          />
        </div>
      }
    >
      {noYear ? (
        <EmptyState
          icon={CalendarSearch}
          title="لا توجد سنة دراسية تشمل تاريخ هذه الحصة"
          description="اختر السنة الدراسية والسداسي."
          className="py-6"
        />
      ) : (
        <QueryState query={query}>
          {data && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {data.scope.allStudents
                  ? `قائمة موحّدة لطلبة الحصة المشتركة (${countLabels.students(students.length)})، كل طالب في قسمه ومجموعته.`
                  : `تظهر هنا طلبة أقسامك فقط في هذه الحصة المشتركة (${countLabels.students(students.length)}).`}
              </p>
              {students.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا يوجد طلبة في هذه الحصة.</p>
              ) : (
                <ul className="divide-y">
                  {data.students.map((s, i) => (
                    <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 items-center gap-2 sm:w-64">
                        <PersonCell name={`${s.firstName} ${s.lastName}`} photoUrl={s.photoUrl ?? undefined} size="sm" />
                        <Badge variant="outline">{s.groupClass.group.name}</Badge>
                        {s.studentStatus !== "ACTIVE" && <StatusBadge status={s.studentStatus} />}
                      </div>
                      <MemorizationValue surah={s.lastMemorizedSurahNumber ?? undefined} className="flex-1 text-sm" />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => memorization.open(students[i], academicYearId, semester, students)}
                        aria-label={`تحديث الحفظ: ${fullName(students[i])}`}
                      >
                        <BookMarked />
                        تحديث
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </QueryState>
      )}
      {memorization.dialog}
    </SectionCard>
  )
}

type Memo = SessionMemorizationDto & { uiSemester: Semester }

/** The fields the memorization dialog needs (it shows the student's program and supervisor). */
function toStudent(s: SessionMemorizationDto["students"][number]): Student {
  return {
    id: s.studentId,
    firstName: s.firstName,
    lastName: s.lastName,
    photoUrl: s.photoUrl ?? undefined,
    groupClassId: s.groupClass.id,
    status: s.studentStatus,
    dateOfBirth: "",
    address: "",
    registrationDate: "",
  }
}

/** The lesson's period, for the dialog and the selector. */
function yearOf(data: Memo): AcademicYear {
  const range = { startDate: data.period.from, endDate: data.period.to }
  return {
    id: data.academicYear.id,
    label: data.academicYear.label,
    isCurrent: false,
    ...range,
    semesters: { SEMESTER_1: range, SEMESTER_2: range },
  }
}

/** Just enough reference data for the dialog's summary: each class's program, the branch, the supervisor. */
function lookupsOf(row: SessionRow, data?: Memo): Lookups {
  const classes = data?.classes ?? []
  return {
    branches: [{ id: row.branch.id, name: row.branch.name, address: "", status: "ACTIVE" }],
    rooms: [],
    groups: classes.map((c) => ({ id: c.group.id, name: c.group.name, audience: "", status: "ACTIVE", createdAt: "" })),
    groupClasses: classes.map((c) => ({
      id: c.id,
      groupId: c.group.id,
      branchId: row.branch.id,
      supervisorId: row.supervisor?.id ?? "",
      assistantIds: [],
      status: "ACTIVE",
    })),
    teachers: row.supervisor
      ? [{ ...row.supervisor, phone: "", joinedAt: "" }]
      : [],
    schedules: [],
  }
}
