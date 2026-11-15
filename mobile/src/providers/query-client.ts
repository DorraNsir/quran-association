import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { ApiError } from '@/services/api';

/**
 * Retry only what can succeed on a second try: network failures and 5xx.
 * A 4xx (validation, 401/403 permissions, 404) will not change by retrying.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) return error.isNetwork || error.status >= 500;
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  });
}

/** React Native has no window focus: refetch stale queries when the app returns to foreground. */
export function bindAppFocus(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
  return () => subscription.remove();
}
