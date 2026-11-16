import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api';

import { SURAH_COUNT } from '../quran/surahs';
import { saveStudentMemorization } from './teacher.api';
import type { MemorizationRecord, Semester } from './types';
import { teacherKey } from './use-teacher-dashboard';

export interface MemorizationInput {
  academicYearId: string;
  semester: Semester;
  lastMemorizedSurahNumber: number | null;
}

/** The DTO's own rules, checked before sending (the server checks them again). */
export function validateMemorization(input: MemorizationInput): 'surahRequired' | 'surahInvalid' | null {
  const n = input.lastMemorizedSurahNumber;
  if (n === null) return 'surahRequired';
  if (!Number.isInteger(n) || n < 1 || n > SURAH_COUNT) return 'surahInvalid';
  return null;
}

export type MemorizationSaveError = 'offline' | 'denied' | 'notEnrolled' | 'invalid' | 'unknown';

/** Every failure keeps the form as it is; the kind decides the message. */
export function classifyMemorizationError(error: unknown): MemorizationSaveError {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.isNetwork) return 'offline';
  if (error.isForbidden || error.isNotFound) return 'denied';
  if (error.code === 'MEMORIZATION_STUDENT_NOT_ENROLLED') return 'notEnrolled';
  if (error.status === 400) return 'invalid';
  return 'unknown';
}

/**
 * After a CONFIRMED save: the server's record becomes that semester's data,
 * then every memorization view is refreshed — the student's semesters, the
 * class lists and the dashboard progress (all under …/'memorization').
 */
export function applySavedMemorization(
  queryClient: QueryClient,
  teacherId: string,
  studentId: string,
  saved: MemorizationRecord,
) {
  queryClient.setQueryData(
    [...teacherKey(teacherId), 'memorization', 'student', studentId, saved.academicYear.id, saved.semester],
    saved,
  );
  return queryClient.invalidateQueries({ queryKey: [...teacherKey(teacherId), 'memorization'] });
}

/** The save mutation: never retried automatically, no optimistic update. */
export function useSaveMemorization(teacherId: string, studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['save-memorization', studentId],
    mutationFn: (input: { academicYearId: string; semester: Semester; lastMemorizedSurahNumber: number }) =>
      saveStudentMemorization(studentId, input),
    onSuccess: (saved) => applySavedMemorization(queryClient, teacherId, studentId, saved),
  });
}
