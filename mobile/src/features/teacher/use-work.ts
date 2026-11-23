import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { WorkPerformance } from '@/features/quran-reference/work-assignment';

import {
  createWorkProgram,
  evaluateWorkProgram,
  fetchEligibleSessions,
  fetchWorkProgram,
  fetchRecitationHistory,
  fetchWorkPrograms,
  fetchWorkSessionOptions,
  scheduleWorkItem,
  updateWorkProgram,
  type ScheduleFor,
} from './teacher.api';
import { teacherKey } from './use-teacher-dashboard';
import type { EvaluationLine, NewWorkItem, WorkItemPatch, WorkProgram, WorkProgramFilters } from './work-types';

/** Programs per page (server pagination, "load more"). */
export const WORK_PAGE_SIZE = 20;

/** One root per teacher: every confirmed change refreshes the list, the programs and the eligible sessions. */
export const workKey = (teacherId: string) => [...teacherKey(teacherId), 'work'] as const;
export const workProgramKey = (teacherId: string, id: string) => [...workKey(teacherId), 'program', id] as const;

export function useWorkProgramPages(teacherId: string, filters: WorkProgramFilters) {
  return useInfiniteQuery({
    queryKey: [...workKey(teacherId), 'list', filters],
    queryFn: ({ pageParam, signal }) => fetchWorkPrograms({ ...filters, page: pageParam, pageSize: WORK_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    enabled: !!teacherId,
  });
}

export function useWorkProgram(teacherId: string, id: string) {
  return useQuery({
    queryKey: workProgramKey(teacherId, id),
    queryFn: ({ signal }) => fetchWorkProgram(id, signal),
    enabled: !!teacherId && id.length > 0,
  });
}

/** Sessions that have programs (the «الحصة» filter). */
export function useWorkSessionOptions(teacherId: string) {
  return useQuery({
    queryKey: [...workKey(teacherId), 'session-options'],
    queryFn: ({ signal }) => fetchWorkSessionOptions(signal),
    enabled: !!teacherId,
  });
}

/** The student's existing upcoming sessions that may receive work (optionally later than a source session). */
export function useEligibleSessions(teacherId: string, studentId: string | null, afterSessionId?: string, forItem?: ScheduleFor) {
  return useQuery({
    queryKey: [...workKey(teacherId), 'eligible', studentId, afterSessionId ?? null, forItem?.itemId ?? null, forItem?.purpose ?? null],
    queryFn: ({ signal }) => fetchEligibleSessions(studentId!, afterSessionId, signal, forItem),
    enabled: !!teacherId && !!studentId,
  });
}

/**
 * After a CONFIRMED write: the server's program becomes its cached data (never
 * an optimistic guess), then everything under «work» is refetched — lists,
 * other programs (a transfer changes the source's links), eligible sessions.
 */
export function applySavedProgram(queryClient: QueryClient, teacherId: string, saved: WorkProgram) {
  queryClient.setQueryData(workProgramKey(teacherId, saved.id), saved);
  return queryClient.invalidateQueries({
    queryKey: workKey(teacherId),
    predicate: (q) => !(q.queryKey[3] === 'program' && q.queryKey[4] === saved.id),
  });
}

const useWorkMutation = <V,>(teacherId: string, key: string, fn: (v: V) => Promise<WorkProgram>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['work', key],
    mutationFn: fn,
    onSuccess: (saved) => applySavedProgram(queryClient, teacherId, saved),
  });
};

export const useCreateWorkProgram = (teacherId: string) =>
  useWorkMutation(teacherId, 'create', (b: { studentId: string; sessionId: string; generalNotes: string | null; items: NewWorkItem[] }) =>
    createWorkProgram(b),
  );

export const useUpdateWorkProgram = (teacherId: string, id: string) =>
  useWorkMutation(teacherId, `update-${id}`, (b: { version?: number; generalNotes?: string | null; items?: WorkItemPatch[]; newItems?: NewWorkItem[] }) =>
    updateWorkProgram(id, b),
  );

export const useEvaluateWorkProgram = (teacherId: string, id: string) =>
  useWorkMutation(teacherId, `evaluate-${id}`, (b: { items: EvaluationLine[]; version?: number; generalNotes?: string | null; overall?: WorkPerformance }) =>
    evaluateWorkProgram(id, b),
  );

/** «متابعة العرضات» of a student (all surahs). Under «work»: every work change refreshes it. */
export function useRecitationHistory(teacherId: string, studentId: string) {
  return useQuery({
    queryKey: [...workKey(teacherId), 'recitations', studentId],
    queryFn: ({ signal }) => fetchRecitationHistory(studentId, signal),
    enabled: !!teacherId && studentId.length > 0,
  });
}

export const useScheduleWorkItem = (teacherId: string, itemId: string, mode: 'carry' | 'next') =>
  useWorkMutation(teacherId, `${mode}-${itemId}`, (b: { targetSessionId: string; description?: string }) =>
    scheduleWorkItem(itemId, mode, b.targetSessionId, b.description),
  );
