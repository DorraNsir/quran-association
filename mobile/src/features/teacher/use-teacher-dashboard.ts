import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { preferencesQueryKey, usePreferences } from '@/features/preferences/preferences';

import {
  currentSemester,
  memorizationProgress,
  platformClock,
  teacherClasses,
} from './dashboard-model';
import { addDays, toSessionItem } from './sessions-model';
import {
  fetchClassMemorization,
  fetchTeacherAttendanceSummary,
  fetchTeacherSessions,
  fetchTeacherWorkspace,
} from './teacher.api';

/** Every teacher query lives under this key (scoped to the signed-in teacher). */
export const teacherKey = (teacherId: string) => ['teacher', teacherId] as const;

/** Today's lessons of one teacher: a handful at most; bounded anyway. */
const TODAY_MAX = 50;

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

  // «حصص اليوم» (the web dashboard's section): every lesson of the platform
  // day, whatever its status — done, cancelled or still to come
  const today = useQuery({
    queryKey: [...teacherKey(teacherId), 'sessions', 'today', clock.today],
    queryFn: ({ signal }) =>
      fetchTeacherSessions({ from: clock.today, to: clock.today, order: 'asc', pageSize: TODAY_MAX }, signal),
    enabled: prefsSettled,
  });
  // No lesson today: «الحصة القادمة», one small request, only then
  const todayEmpty = today.isSuccess && today.data.data.length === 0;
  const next = useQuery({
    queryKey: [...teacherKey(teacherId), 'sessions', 'next', clock.today],
    queryFn: ({ signal }) =>
      fetchTeacherSessions(
        { from: addDays(clock.today, 1), status: 'SCHEDULED', order: 'asc', pageSize: 1 },
        signal,
      ),
    enabled: todayEmpty,
    select: (page) => page.data[0] ?? null,
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
    today,
    todayList: today.data ? today.data.data.map((s) => toSessionItem(s, clock)) : [],
    nextSession: next.data ? toSessionItem(next.data, clock) : null,
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
