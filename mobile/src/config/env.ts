/**
 * Build-time configuration. Expo inlines EXPO_PUBLIC_* variables into the
 * bundle, so nothing secret may ever be placed here.
 *
 * EXPO_PUBLIC_API_URL must include the "/api" global prefix of the NestJS
 * app (see backend/src/app.setup.ts → API_PREFIX).
 */
/*
 * Development only (Metro on this network). A release build never falls back to a developer's
 * computer: preview / production builds are refused without an https EXPO_PUBLIC_API_URL
 * (app.config.ts), and here a release without one has no API at all (a clear connection error).
 */
const DEV_FALLBACK_API_URL = 'http://192.168.1.19:4000/api';

function normalizeBaseUrl(value: string | undefined, dev: boolean): string {
  const url = (value ?? '').trim().replace(/\/+$/, '');
  return url.length > 0 ? url : dev ? DEV_FALLBACK_API_URL : '';
}

export const env = {
  apiUrl: normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL, typeof __DEV__ !== 'undefined' && __DEV__),
  /** True when the variable was not provided and the fallback is in use. */
  apiUrlIsDefault: !process.env.EXPO_PUBLIC_API_URL,
  /** Per-request timeout (the NestJS API answers well under this). */
  requestTimeoutMs: 20_000,
} as const;
