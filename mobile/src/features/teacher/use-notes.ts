import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { sortNotes } from './notes-model';
import { createTeacherNote, deleteTeacherNote, fetchAllTeacherNotes, updateTeacherNote } from './teacher.api';
import type { TeacherNote } from './types';
import { teacherKey } from './use-teacher-dashboard';

/** Per teacher: another account on this phone never sees these cached notes. */
export const notesKey = (teacherId: string) => [...teacherKey(teacherId), 'notes'] as const;

/** My notes, every page — the complete list, so the search covers all of them. */
export function useTeacherNotes(teacherId: string) {
  return useQuery({
    queryKey: notesKey(teacherId),
    queryFn: ({ signal }) => fetchAllTeacherNotes(signal),
    select: sortNotes,
    enabled: !!teacherId,
  });
}

/**
 * After a CONFIRMED write: the server's answer goes into the list (nothing is
 * shown before it), then the list is refetched from the server.
 */
export function applySavedNote(queryClient: QueryClient, teacherId: string, saved: TeacherNote) {
  queryClient.setQueryData<TeacherNote[]>(notesKey(teacherId), (list) =>
    list ? [saved, ...list.filter((n) => n.id !== saved.id)] : list,
  );
  return queryClient.invalidateQueries({ queryKey: notesKey(teacherId) });
}

export function applyDeletedNote(queryClient: QueryClient, teacherId: string, id: string) {
  queryClient.setQueryData<TeacherNote[]>(notesKey(teacherId), (list) => list?.filter((n) => n.id !== id));
  return queryClient.invalidateQueries({ queryKey: notesKey(teacherId) });
}

/** Create (no id) or edit (id): never retried automatically, no optimistic update. */
export function useSaveNote(teacherId: string, id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['save-note', id ?? 'new'],
    mutationFn: (content: string) => (id ? updateTeacherNote(id, content) : createTeacherNote(content)),
    onSuccess: (saved) => applySavedNote(queryClient, teacherId, saved),
  });
}

/** Removed from the list only once the server confirmed the deletion. */
export function useDeleteNote(teacherId: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['delete-note', id],
    mutationFn: () => deleteTeacherNote(id),
    onSuccess: () => applyDeletedNote(queryClient, teacherId, id),
  });
}
