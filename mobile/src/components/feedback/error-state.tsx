import { Button } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { ApiError, errorMessage } from '@/services/api';

import { StateLayout } from './state-layout';

/**
 * Error state, same rules as the web QueryState: Arabic message from the
 * API, retry button, and no retry for 403 (permissions will not change).
 */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const api = error instanceof ApiError ? error : null;
  const forbidden = api?.isForbidden ?? false;
  // Retrying cannot make a refused or missing resource appear
  const final = forbidden || (api?.isNotFound ?? false);
  const offline = api?.isNetwork ?? false;

  return (
    <StateLayout
      icon={forbidden ? 'forbidden' : offline ? 'offline' : 'error'}
      tone={forbidden ? 'muted' : 'destructive'}
      title={
        forbidden
          ? ar.states.forbiddenTitle
          : offline
            ? ar.states.offlineTitle
            : ar.states.errorTitle
      }
      description={errorMessage(error)}
      action={
        onRetry && !final ? (
          <Button
            variant="outline"
            icon="retry"
            label={ar.states.retry}
            loading={retrying}
            onPress={onRetry}
          />
        ) : undefined
      }
    />
  );
}
