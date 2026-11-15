import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { session, type SessionState } from './session';

/**
 * Starts the session restore, keeps the access token fresh when the app
 * comes back to the foreground, and wipes every user-specific cached query
 * when a session ends (logout, expiry, deactivation).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    void session.restore();
    const offSignedOut = session.onSignedOut(() => queryClient.clear());
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      const { status: current } = session.getState();
      if (current === 'offline') void session.restore();
      else void session.refreshIfExpiringSoon();
    });
    return () => {
      offSignedOut();
      subscription.remove();
    };
  }, [queryClient]);

  return <>{children}</>;
}

/** The session state for the UI (never contains tokens). */
export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}

export { session };
