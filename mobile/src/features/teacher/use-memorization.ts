import { useQueries, useQuery } from '@tanstack/react-query';

import type { CurrentAcademicYear } from '@/features/preferences/preferences';

import { SEMESTERS } from './memorization-model';
import { fetchClassMemorization, fetchStudentMemorization } from './teacher.api';
import type { Semester } from './types';
import { teacherKey } from './use-teacher-dashboard';

/** GET /teacher/group-classes/:id/memorization for one semester (same cache as the dashboard). */
export function useClassMemorization(
  teacherId: string,
  groupClassId: string | null,
  year: CurrentAcademicYear | null,
  semester: Semester,
) {
  return useQuery({
    queryKey: [...teacherKey(teacherId), 'memorization', groupClassId, year?.id, semester],
    queryFn: ({ signal }) => fetchClassMemorization(groupClassId!, { academicYearId: year!.id, semester }, signal),
    enabled: groupClassId !== null && year !== null,
  });
}

/** Both semesters of the current year for one student (two small requests). */
export function useStudentMemorization(teacherId: string, studentId: string, year: CurrentAcademicYear | null) {
  return useQueries({
    queries: SEMESTERS.map((semester) => ({
      queryKey: [...teacherKey(teacherId), 'memorization', 'student', studentId, year?.id, semester],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchStudentMemorization(studentId, { academicYearId: year!.id, semester }, signal),
      enabled: year !== null && studentId.length > 0,
    })),
  });
}
