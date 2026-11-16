import type { CurrentAcademicYear } from '@/features/preferences/preferences';
import { ApiError } from '@/services/api';

import { platformClock } from './dashboard-model';
import type { ClassMemorization, MemorizationRecord, Semester } from './types';

/*
 * «متابعة الحفظ», read-only. Backend model (prisma MemorizationProgress,
 * memorization.service.ts): ONE value per student × academic year ×
 * semester — the LAST MEMORIZED SURAH (mushaf number 1–114; the server gives
 * its name), set by a teacher, with updatedAt / updatedBy. There is no
 * per-lesson history, no verse range, no type (حفظ/مراجعة/تلاوة/تجويد), no
 * evaluation and no comment in this model. A higher surah number is NOT more
 * progress (many students memorize from An-Nas backwards), so no "percent of
 * the Quran" or "highest verse" is derived here.
 */

export const SEMESTERS: readonly Semester[] = ['FIRST', 'SECOND'];

/** A semester's dates in the academic year (the server's own ranges, inclusive). */
export function semesterPeriod(year: CurrentAcademicYear, semester: Semester): { from: string; to: string } {
  const range = semester === 'FIRST' ? year.firstSemester : year.secondSemester;
  return { from: range.startDate, to: range.endDate };
}

/** The platform calendar day of a server timestamp (updatedAt), never the phone's day. */
export function platformDateOf(timestamp: string, timeZone: string | undefined): string {
  return platformClock(timeZone, new Date(timestamp)).today;
}

export interface MemorizationRow {
  studentId: string;
  name: string;
  /** null = «لم يُحدَّد بعد» for this semester */
  surahNumber: number | null;
  surahName: string | null;
  updatedAt: string | null;
}

/**
 * A class's memorization list for one semester — the web teacher page's
 * population: ACTIVE students still in the class today (the API also lists
 * those who left during the semester: not shown, as on the web), by name.
 */
export function memorizationRoster(dto: ClassMemorization): MemorizationRow[] {
  return dto.students
    .filter((s) => s.currentMember && s.studentStatus === 'ACTIVE')
    .map((s) => ({
      studentId: s.studentId,
      name: `${s.firstName} ${s.lastName}`,
      surahNumber: s.lastMemorizedSurahNumber,
      surahName: s.surahName,
      updatedAt: s.updatedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export type SemesterEntry =
  | { semester: Semester; kind: 'recorded'; record: MemorizationRecord }
  | { semester: Semester; kind: 'notRecorded' }
  /** 403: I did not teach this student during that semester (backend access rule) */
  | { semester: Semester; kind: 'notMine' };

/**
 * One student's semesters of the current year, NEWEST first (second, then
 * first). Each from GET /teacher/students/:id/memorization: a record, null
 * (not recorded yet), or 403 for a semester outside my teaching of them.
 * Other failures are not turned into an entry (the screen shows the error).
 */
export function semesterEntry(semester: Semester, result: MemorizationRecord | null | undefined, error: unknown): SemesterEntry | null {
  if (error instanceof ApiError && error.isForbidden) return { semester, kind: 'notMine' };
  if (error) return null;
  if (result === undefined) return null;
  return result ? { semester, kind: 'recorded', record: result } : { semester, kind: 'notRecorded' };
}

/** «تعرض … سداسيًا لم يبدأ بعد»: a semester starting after today. */
export function semesterNotStarted(year: CurrentAcademicYear, semester: Semester, today: string): boolean {
  return semesterPeriod(year, semester).from > today;
}
