import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { HeroBackground } from '@/components/hero-background';

import { releaseApiUrlProblem } from '../../../app.config';
import { DEFAULT_HERO_THEME, fetchHeroTheme, isHeroTheme, useHeroTheme, type HeroTheme } from './hero-theme';
import { SPLASH_MAX_MS, SplashGate } from './splash-gate';

/*
 * Release preparation: the login background follows the website's public «مظهر واجهة الصفحة
 * الرئيسية» setting (never a private file), the native splash never outlives startup, and a
 * release build can only target an https server.
 */
const mockStore: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore[k] = v;
  }),
  deleteItemAsync: jest.fn(async () => undefined),
}));
const mockHide = jest.fn(async () => undefined);
jest.mock('expo-splash-screen', () => ({ hideAsync: () => mockHide(), preventAutoHideAsync: jest.fn(), setOptions: jest.fn() }));
let mockStatus = 'restoring';
jest.mock('./auth-provider', () => ({ useSession: () => ({ status: mockStatus }) }));

type Answer = { status: number; body: unknown } | 'offline';
const urls: string[] = [];
function stub(answer: Answer) {
  urls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    urls.push(`${init?.method ?? 'GET'} ${url} ${init?.headers ? JSON.stringify(init.headers) : ''}`);
    if (answer === 'offline') throw new TypeError('Network request failed');
    return { status: answer.status, ok: answer.status < 300, text: async () => JSON.stringify(answer.body) };
  }) as unknown as typeof fetch;
}

function ThemeProbe() {
  return <HeroBackground theme={useHeroTheme()} />;
}
const clients: QueryClient[] = [];
function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(ui, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
/** Lays the background out (the drawing needs its size). */
async function layout(theme: HeroTheme) {
  const root = await screen.findByTestId(`hero-background-${theme}`, { includeHiddenElements: true });
  await act(async () => root.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } }));
  return root;
}

afterEach(async () => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  await act(async () => {
    for (const c of clients.splice(0)) {
      await c.cancelQueries();
      c.clear();
    }
  });
});

describe('the login background: the website setting «مظهر واجهة الصفحة الرئيسية»', () => {
  it('read from the PUBLIC site settings, without any token', async () => {
    stub({ status: 200, body: { heroTheme: 'stars', name: 'x' } });
    await expect(fetchHeroTheme()).resolves.toBe('stars');
    expect(urls[0]).toMatch(/^GET .*\/public\/site-settings/);
    expect(urls[0]).not.toMatch(/Authorization/);
  });

  it('an unknown value from a newer server: the web default', async () => {
    stub({ status: 200, body: { heroTheme: 'fireworks' } });
    await expect(fetchHeroTheme()).resolves.toBe(DEFAULT_HERO_THEME);
    expect(DEFAULT_HERO_THEME).toBe('combo');
    expect(['geometric', 'aurora', 'lights', 'stars', 'letters', 'combo'].every(isHeroTheme)).toBe(true);
  });

  it('the admin’s change shows on the next visit; it is remembered for an offline launch', async () => {
    stub({ status: 200, body: { heroTheme: 'letters' } });
    await renderWithQuery(<ThemeProbe />);
    expect(await screen.findByTestId('hero-background-letters', { includeHiddenElements: true })).toBeTruthy();
    expect(mockStore['qa.heroTheme.v1']).toBe('letters');
    // later, offline: the last theme seen
    stub('offline');
    await renderWithQuery(<ThemeProbe />);
    expect(await screen.findByTestId('hero-background-letters', { includeHiddenElements: true })).toBeTruthy();
  });

  it('offline on the very first launch: the default background (never an empty screen, never waiting)', async () => {
    stub('offline');
    await renderWithQuery(<ThemeProbe />);
    expect(screen.getByTestId('hero-background-combo', { includeHiddenElements: true })).toBeTruthy();
  });

  it.each(['geometric', 'aurora', 'lights', 'stars', 'letters', 'combo'] as const)('«%s» draws its layers, decorative only', async (theme) => {
    await render(<HeroBackground theme={theme} />);
    const root = await layout(theme);
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props.pointerEvents).toBe('none');
    // after layout, its layers are drawn (nothing before the size is known)
    expect(root.children.length).toBeGreaterThan(0);
    const tree = JSON.stringify(screen.toJSON());
    if (theme === 'geometric' || theme === 'combo') expect(tree).toContain('"resizeMode":"repeat"');
    if (theme === 'aurora' || theme === 'combo') expect(tree).toContain('radial-gradient(ellipse closest-side');
    if (theme === 'letters') expect(tree).toMatch(/[ابتثجحخدذرسشصضطظعغفقكلمنهوي]/);
    if (theme === 'stars') expect(tree).toContain('#e8cf98');
  });
});

describe('the native splash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockHide.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('stays while the stored session is being checked, then hides at once', async () => {
    mockStatus = 'restoring';
    const view = await render(<SplashGate />);
    expect(mockHide).not.toHaveBeenCalled();
    mockStatus = 'signedIn';
    await view.rerender(<SplashGate />);
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it('never longer than the cap: a slow / failed check shows the app’s own screens', async () => {
    mockStatus = 'restoring';
    await render(<SplashGate />);
    await act(async () => jest.advanceTimersByTime(SPLASH_MAX_MS - 1));
    expect(mockHide).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it('nothing to check (signed out / offline): hidden immediately, no artificial delay', async () => {
    mockStatus = 'signedOut';
    await render(<SplashGate />);
    expect(mockHide).toHaveBeenCalledTimes(1);
  });
});

describe('release builds: only an https server', () => {
  it('refuses a missing URL, http, localhost, emulator / LAN addresses and a URL without /api', () => {
    expect(releaseApiUrlProblem(undefined)).toMatch(/not set/);
    expect(releaseApiUrlProblem('http://api.omarelkhattab.com/api')).toMatch(/https/);
    expect(releaseApiUrlProblem('https://localhost:4000/api')).toMatch(/local/);
    expect(releaseApiUrlProblem('https://10.0.2.2:4000/api')).toMatch(/local/);
    expect(releaseApiUrlProblem('https://192.168.1.19:4000/api')).toMatch(/local/);
    expect(releaseApiUrlProblem('https://172.20.10.4/api')).toMatch(/local/);
    expect(releaseApiUrlProblem('https://api.omarelkhattab.com')).toMatch(/\/api/);
  });

  it('accepts the production server', () => {
    expect(releaseApiUrlProblem('https://api.omarelkhattab.com/api')).toBeNull();
    expect(releaseApiUrlProblem('https://api.omarelkhattab.com/api/')).toBeNull();
  });
});
