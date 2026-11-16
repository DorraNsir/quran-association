import { useQuery } from '@tanstack/react-query';

import { api } from '@/services/api';

/** GET /api/platform-preferences — any signed-in role (backend settings.dto.ts PlatformPreferencesDto). */
export interface SemesterRange {
  startDate: string;
  endDate: string;
}
export interface CurrentAcademicYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  firstSemester: SemesterRange;
  secondSemester: SemesterRange;
}
export interface PlatformPreferences {
  timezone: string;
  dateFormat: string;
  defaultCalendarView: string;
  defaultPageSize: number;
  currentAcademicYear: CurrentAcademicYear | null;
}

export const preferencesQueryKey = ['platform-preferences'] as const;

export const fetchPreferences = (signal?: AbortSignal) =>
  api<PlatformPreferences>('/platform-preferences', { signal });

export function usePreferences() {
  return useQuery({
    queryKey: preferencesQueryKey,
    queryFn: ({ signal }) => fetchPreferences(signal),
    staleTime: 10 * 60_000,
  });
}
