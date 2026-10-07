import type { CookieOptions, Request, Response } from 'express';

import {
  NodeEnv,
  type EnvironmentVariables,
} from '../config/env.validation.js';

export const REFRESH_COOKIE = 'qa_refresh';
/** The cookie is only ever sent to the auth endpoints (refresh / logout). */
export const REFRESH_COOKIE_PATH = '/api/auth';

type CookieEnv = Pick<
  EnvironmentVariables,
  'NODE_ENV' | 'REFRESH_COOKIE_SAMESITE'
>;

export function refreshCookieOptions(
  env: CookieEnv,
  maxAgeMs?: number,
): CookieOptions {
  return {
    httpOnly: true,
    // Always Secure in production; SameSite=None requires Secure everywhere
    secure:
      env.NODE_ENV === NodeEnv.Production ||
      env.REFRESH_COOKIE_SAMESITE === 'none',
    sameSite: env.REFRESH_COOKIE_SAMESITE,
    path: REFRESH_COOKIE_PATH,
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[
    REFRESH_COOKIE
  ];
  return typeof value === 'string' ? value : undefined;
}

export function setRefreshCookie(
  res: Response,
  env: CookieEnv,
  token: string,
  maxAgeMs: number,
) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(env, maxAgeMs));
}

export function clearRefreshCookie(res: Response, env: CookieEnv) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(env));
}
