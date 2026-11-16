import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { preferencesQueryKey, usePreferences } from '@/features/preferences/preferences';

import {
  currentSemester,
  memorizationProgress,
  platformClock,
  teacherClasses,
  upcomingSessions,
} from './dashboard-model';
import {
  fetchClassMemorization,
  fetchTeacherAttendanceSummary,
  fetchTeacherSessions,
  fetchTeacherWorkspace,
} from './teacher.api';

/** Every teacher query lives under this key (scoped to the signed-in teacher). */
export const teacherKey = (teacherId: string) => ['teacher', teacherId] as const;

const UPCOMING_FETCH = 10;
const UPCOMING_SHOWN = 5;

/**
 * GET /teacher/workspace — one cached bundle shared by the dashboard, the
 * classes list, a class and a student screen (no extra request when
 * navigating between them).
 */
export function useTeacherWorkspace(teacherId: string) {
  return useQuery({
    queryKey: [...teacherKey(teacherId), 'workspace'],
    queryFn: ({ signal }) => fetchTeacherWorkspace(signal),
  });
}

/**
 * The dashboard's server state. Each section is its own query so one
 * failing endpoint never blanks the whole screen.
 */
export function useTeacherDashboard(teacherId: string) {
  const preferences = usePreferences();
  // Until preferences answer, wait; if they fail, fall back to the device clock
  const prefsSettled = !preferences.isPending;
  const timezone = preferences.data?.timezone;
  const year = preferences.data?.currentAcademicYear ?? null;
  const clock = platformClock(timezone);

  const workspace = useTeacherWorkspace(teacherId);

  const completedCount = useQuery({
    queryKey: [...teacherKey(teacherId), 'sessions', 'completed-count'],
    queryFn: ({ signal }) => fetchTeacherSessions({ status: 'COMPLETED', pageSize: 1 }, signal),
    select: (page) => page.meta.total,
  });

  const upcoming = useQuery({
    queryKey: [...teacherKey(teacherId), 'sessions', 'upcoming', clock.today],
    queryFn: ({ signal }) =>
      fetchTeacherSessions(
        { from: clock.today, status: 'SCHEDULED', order: 'asc', pageSize: UPCOMING_FETCH },
        signal,
      ),
    enabled: prefsSettled,
  });

  const attendance = useQuery({
    queryKey: [...teacherKey(teacherId), 'attendance-summary', year?.id ?? 'all'],
    queryFn: ({ signal }) =>
      fetchTeacherAttendanceSummary(year ? { academicYearId: year.id } : {}, signal),
    enabled: prefsSettled,
  });

  const classes = useMemo(
    () => (workspace.data ? teacherClasses(workspace.data) : []),
    [workspace.data],
  );
  const semester = year ? currentSemester(year, clock.today) : null;

  const memorization = useQueries({
    queries: classes.map((c) => ({
      queryKey: [...teacherKey(teacherId), 'memorization', c.id, year?.id, semester],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchClassMemorization(c.id, { academicYearId: year!.id, semester: semester! }, signal),
      enabled: year !== null && semester !== null,
      select: memorizationProgress,
    })),
  });

  return {
    clock,
    year,
    semester,
    preferences,
    workspace,
    classes,
    completedCount,
    upcoming,
    upcomingList: upcoming.data ? upcomingSessions(upcoming.data.data, clock, UPCOMING_SHOWN) : [],
    attendance,
    memorization,
  };
}

/** Pull-to-refresh: refetch the teacher's queries and the platform preferences. */
export function useRefreshTeacherDashboard(teacherId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: teacherKey(teacherId) }),
      queryClient.invalidateQueries({ queryKey: preferencesQueryKey }),
    ]);
}
