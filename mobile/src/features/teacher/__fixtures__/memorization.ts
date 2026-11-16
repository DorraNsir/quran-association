import type { ClassMemorization, ClassMemorizationStudent, MemorizationRecord, Semester } from '../types';

/** TEST-ONLY data shaped like the memorization DTOs. Never imported by app code. */
export const YEAR_FIXTURE = {
  id: '0190a000-0000-7000-8000-000000000001',
  label: '2026-2027',
  startDate: '2026-09-15',
  endDate: '2027-06-30',
  firstSemester: { startDate: '2026-09-15', endDate: '2027-01-31' },
  secondSemester: { startDate: '2027-02-01', endDate: '2027-06-30' },
};

export function memoStudent(
  id: string,
  firstName: string,
  extra: Partial<ClassMemorizationStudent> = {},
): ClassMemorizationStudent {
  return {
    studentId: id,
    firstName,
    lastName: 'التونسي',
    photoUrl: null,
    studentStatus: 'ACTIVE',
    currentMember: true,
    lastMemorizedSurahNumber: null,
    surahName: null,
    updatedAt: null,
    ...extra,
  };
}

export function classMemoFixture(
  students: ClassMemorizationStudent[],
  extra: Partial<ClassMemorization> = {},
): ClassMemorization {
  return {
    groupClass: { id: 'c1', group: { id: 'g1', name: 'مجموعة الفجر' } },
    academicYear: { id: YEAR_FIXTURE.id, label: YEAR_FIXTURE.label },
    semester: 'FIRST',
    period: { from: YEAR_FIXTURE.firstSemester.startDate, to: YEAR_FIXTURE.firstSemester.endDate },
    students,
    ...extra,
  };
}

export function recordFixture(
  studentId: string,
  semester: Semester,
  surah: number,
  surahName: string,
  updatedAt: string,
): MemorizationRecord {
  return {
    studentId,
    academicYear: { id: YEAR_FIXTURE.id, label: YEAR_FIXTURE.label },
    semester,
    lastMemorizedSurahNumber: surah,
    surahName,
    updatedAt,
    updatedBy: 'ahmed.t',
  };
}
