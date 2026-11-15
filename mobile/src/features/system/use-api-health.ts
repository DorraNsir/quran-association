import { useQuery } from '@tanstack/react-query';

import { fetchHealth } from '@/services/health';

export const healthQueryKey = ['system', 'health'] as const;

/** Live reachability of the NestJS API and its database. */
export function useApiHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: ({ signal }) => fetchHealth(signal),
    staleTime: 15_000,
  });
}
