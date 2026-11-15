import type { ReactNode } from 'react';

import type { IconName } from '@/components/ui';

import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { LoadingState } from './loading-state';

interface QueryLike {
  isPending: boolean;
  isError: boolean;
  isRefetching?: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * The four states of server data, everywhere the same: loading, error
 * (with retry), empty, content. Never falls back to placeholder data.
 */
export function QueryState({
  query,
  empty = false,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  loadingLabel,
  children,
}: {
  query: QueryLike | readonly QueryLike[];
  empty?: boolean;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptyDescription?: string;
  loadingLabel?: string;
  children: ReactNode;
}) {
  const queries: readonly QueryLike[] = Array.isArray(query) ? query : [query as QueryLike];
  const failed = queries.find((q) => q.isError);
  if (failed) {
    return (
      <ErrorState
        error={failed.error}
        retrying={queries.some((q) => q.isRefetching)}
        onRetry={() => queries.forEach((q) => q.isError && q.refetch())}
      />
    );
  }
  if (queries.some((q) => q.isPending)) return <LoadingState label={loadingLabel} />;
  if (empty)
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  return <>{children}</>;
}
