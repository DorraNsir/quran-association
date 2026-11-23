import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

import { api } from '@/services/api';

/*
 * «مظهر واجهة الصفحة الرئيسية» on the login screen. The ONE source of truth is the website's
 * setting (SiteSettings.heroTheme, chosen by an admin in /admin/website/home), read from the
 * PUBLIC endpoint the web home and the web login already use: GET /api/public/site-settings
 * (no authentication, no file — a theme name; the drawing is in code, as on the web).
 */

export type HeroTheme = 'geometric' | 'aurora' | 'lights' | 'stars' | 'letters' | 'combo';

const THEMES: readonly HeroTheme[] = ['geometric', 'aurora', 'lights', 'stars', 'letters', 'combo'];

/** The web's default (frontend hero-background.tsx DEFAULT_HERO_THEME). */
export const DEFAULT_HERO_THEME: HeroTheme = 'combo';

export const isHeroTheme = (value: unknown): value is HeroTheme => THEMES.includes(value as HeroTheme);

/** The last theme seen, kept on the device for an offline launch (a public name, nothing secret). */
const STORE_KEY = 'qa.heroTheme.v1';

async function readStored(): Promise<HeroTheme | null> {
  try {
    const value = await SecureStore.getItemAsync(STORE_KEY);
    return isHeroTheme(value) ? value : null;
  } catch {
    return null;
  }
}

async function store(theme: HeroTheme) {
  try {
    await SecureStore.setItemAsync(STORE_KEY, theme);
  } catch {
    // a cache only: the next launch fetches it again
  }
}

/** GET /public/site-settings → its heroTheme (an unknown value: the default). */
export async function fetchHeroTheme(signal?: AbortSignal): Promise<HeroTheme> {
  const settings = await api<{ heroTheme?: unknown }>('/public/site-settings', { auth: false, signal });
  return isHeroTheme(settings.heroTheme) ? settings.heroTheme : DEFAULT_HERO_THEME;
}

/**
 * The theme to draw now: the server's (fetched each time the login screen opens, so an admin's
 * change shows on the next visit), else the last one seen on this device, else the default —
 * offline or unreachable, the login screen always has a background and never waits for it.
 */
export function useHeroTheme(): HeroTheme {
  const [stored, setStored] = useState<HeroTheme | null>(null);
  const query = useQuery({
    queryKey: ['public', 'hero-theme'],
    queryFn: ({ signal }) => fetchHeroTheme(signal),
    staleTime: 60_000,
    retry: 1,
  });
  useEffect(() => {
    let alive = true;
    void readStored().then((value) => alive && setStored(value));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (query.data) void store(query.data);
  }, [query.data]);
  return query.data ?? stored ?? DEFAULT_HERO_THEME;
}
