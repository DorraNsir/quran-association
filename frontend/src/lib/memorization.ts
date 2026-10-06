/**
 * Memorization tracking: one "last memorized surah" per
 * (student, academic year, semester). Pure helpers over data — shared by
 * the admin screens now and the Teacher Space later; the API will own them.
 */
import type {
  AcademicYear,
  GroupClass,
  ID,
  ISODate,
  MemorizationProgress,
  Semester,
  Student,
  SurahNumber,
} from "@/types/domain"

export const SEMESTERS: Semester[] = ["SEMESTER_1", "SEMESTER_2"]

/** The unique key of a memorization value. */
export function memorizationKey(studentId: ID, academicYearId: ID, semester: Semester) {
  return `${studentId}|${academicYearId}|${semester}`
}

/** Index records by key for O(1) lookups in tables. */
export function indexMemorization(records: MemorizationProgress[]) {
  return new Map(records.map((r) => [memorizationKey(r.studentId, r.academicYearId, r.semester), r]))
}

export function getMemorizationProgress(
  records: MemorizationProgress[],
  studentId: ID,
  academicYearId: ID,
  semester: Semester
) {
  return records.find(
    (r) => r.studentId === studentId && r.academicYearId === academicYearId && r.semester === semester
  )
}

export function getStudentLastMemorizedSurah(
  records: MemorizationProgress[],
  studentId: ID,
  academicYearId: ID,
  semester: Semester
): SurahNumber | undefined {
  return getMemorizationProgress(records, studentId, academicYearId, semester)?.lastMemorizedSurah
}

export interface MemorizationUpdate {
  studentId: ID
  academicYearId: ID
  semester: Semester
  lastMemorizedSurah: SurahNumber
  updatedByTeacherId: ID
  updatedAt: ISODate
}

/**
 * Sets the value for (student, year, semester): updates the existing record
 * if there is one, otherwise creates it. Never touches other semesters/years
 * and never appends a history entry.
 */
export function upsertMemorization(
  records: MemorizationProgress[],
  update: MemorizationUpdate,
  newId: () => ID
): MemorizationProgress[] {
  const existing = getMemorizationProgress(records, update.studentId, update.academicYearId, update.semester)
  if (existing) return records.map((r) => (r.id === existing.id ? { ...existing, ...update } : r))
  return [...records, { id: newId(), ...update }]
}

/** The semester a date falls in, or undefined outside the school year. */
export function semesterOn(year: AcademicYear, date: ISODate): Semester | undefined {
  return SEMESTERS.find((s) => date >= year.semesters[s].startDate && date <= year.semesters[s].endDate)
}

/** Default period to show: the current year and the semester "today" falls in (else the first). */
export function defaultPeriod(years: AcademicYear[], today: ISODate) {
  const year = years.find((y) => y.isCurrent) ?? years[years.length - 1]
  return { academicYearId: year.id, semester: semesterOn(year, today) ?? "SEMESTER_1" }
}

/**
 * Who is recorded as having updated the value. In the prototype (admin) it
 * is the supervisor of the student's class; in Teacher Space it will be the
 * logged-in teacher.
 */
export function defaultUpdater(student: Pick<Student, "groupClassId">, groupClasses: GroupClass[]) {
  return groupClasses.find((c) => c.id === student.groupClassId)?.supervisorId
}
