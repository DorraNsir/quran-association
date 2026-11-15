import { api } from '@/services/api';

import type { MobileAuthResponse } from './types';

/**
 * /api/auth/mobile/* (backend/src/auth/mobile-auth.controller.ts). Login,
 * refresh and logout are public: sent WITHOUT the access token and without
 * the 401→refresh retry (auth: false), so they can never recurse.
 */
export const mobileLogin = (username: string, password: string) =>
  api<MobileAuthResponse>('/auth/mobile/login', {
    method: 'POST',
    body: { username, password },
    auth: false,
  });

export const mobileRefresh = (refreshToken: string) =>
  api<MobileAuthResponse>('/auth/mobile/refresh', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
  });

export const mobileLogout = (refreshToken: string) =>
  api<void>('/auth/mobile/logout', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
    timeoutMs: 5_000,
  });

/** Bearer-authenticated; allowed while mustChangePassword is true. */
export const mobileChangePassword = (currentPassword: string, newPassword: string) =>
  api<MobileAuthResponse>('/auth/mobile/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
