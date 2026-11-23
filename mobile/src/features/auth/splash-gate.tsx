import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { useSession } from './auth-provider';

/** Never longer than this on the native splash: then the app's own «restoring» / offline screens. */
export const SPLASH_MAX_MS = 4000;

/**
 * The native splash stays while the essentials load — the fonts (the root layout renders this
 * only once they are ready), then the stored session's check with the server — and no longer:
 * no artificial delay, and capped so a slow or failed check (offline, server down) never leaves
 * anyone on it.
 */
export function SplashGate() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'restoring') {
      void SplashScreen.hideAsync();
      return;
    }
    const timer = setTimeout(() => void SplashScreen.hideAsync(), SPLASH_MAX_MS);
    return () => clearTimeout(timer);
  }, [status]);
  return null;
}
