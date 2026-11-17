import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';

import { isLinkType, resourceBody, TYPE_MIMES, type ResourceDraft } from './resource-model';
import type { PickedFile, Resource, ResourceFilters } from './resource-types';
import { createResource, deleteResource, fetchResource, fetchResources, updateResource, uploadResourceFile } from './teacher.api';
import { teacherKey } from './use-teacher-dashboard';

export const RESOURCES_PAGE_SIZE = 20;

export const resourcesKey = (teacherId: string) => [...teacherKey(teacherId), 'resources'] as const;
export const resourceKey = (teacherId: string, id: string) => [...resourcesKey(teacherId), 'one', id] as const;

/** GET /teacher/resources, server-filtered and paginated ("load more"). */
export function useResourcePages(teacherId: string, filters: ResourceFilters) {
  return useInfiniteQuery({
    queryKey: [...resourcesKey(teacherId), 'list', filters],
    queryFn: ({ pageParam, signal }) => fetchResources({ ...filters, page: pageParam, pageSize: RESOURCES_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    enabled: !!teacherId,
  });
}

export function useResource(teacherId: string, id: string) {
  return useQuery({
    queryKey: resourceKey(teacherId, id),
    queryFn: ({ signal }) => fetchResource(id, signal),
    enabled: !!teacherId && id.length > 0,
  });
}

/** After a CONFIRMED write: the server's resource is cached, then every resource list is refetched. */
export function applySavedResource(queryClient: QueryClient, teacherId: string, saved: Resource) {
  queryClient.setQueryData(resourceKey(teacherId, saved.id), saved);
  return queryClient.invalidateQueries({
    queryKey: resourcesKey(teacherId),
    predicate: (q) => !(q.queryKey[3] === 'one' && q.queryKey[4] === saved.id),
  });
}

/**
 * Create (no id) or edit: a NEW file is uploaded first (tied to the first
 * target class, as the web does), then the resource is saved with its fileId.
 * Never retried automatically; nothing shown as saved before the server says so.
 */
export function useSaveResource(teacherId: string, id?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['save-resource', id ?? 'new'],
    mutationFn: async (draft: ResourceDraft) => {
      let fileId: string | undefined;
      if (!isLinkType(draft.type) && draft.file) fileId = (await uploadResourceFile(draft.file, draft.classIds[0]!)).id;
      const body = resourceBody(draft, fileId);
      return id ? updateResource(id, body) : createResource(body);
    },
    onSuccess: (saved) => applySavedResource(queryClient, teacherId, saved),
  });
}

/** DELETE: removed from the lists only once the server confirmed it. */
export function useDeleteResource(teacherId: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['delete-resource', id],
    mutationFn: () => deleteResource(id),
    // The lists are refetched; the deleted resource itself is never asked for again
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: resourcesKey(teacherId),
        predicate: (q) => !(q.queryKey[3] === 'one' && q.queryKey[4] === id),
      }),
  });
}

/** The system document picker, limited to the types this resource accepts; null when cancelled. */
export async function pickResourceFile(type: keyof typeof TYPE_MIMES): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...TYPE_MIMES[type]],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? null, size: asset.size ?? null };
}
