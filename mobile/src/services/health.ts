import { api } from './api';

/**
 * GET /api/health — @Public() (backend/src/health/health.controller.ts).
 * 200 when the database is up; 503 with the same body when it is down.
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'up' | 'down';
  uptimeSeconds: number;
  timestamp: string;
}

export const fetchHealth = (signal?: AbortSignal) =>
  api<HealthResponse>('/health', { auth: false, signal });
