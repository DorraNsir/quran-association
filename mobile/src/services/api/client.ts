import { env } from '@/config/env';

import { getAuthBridge } from './auth-bridge';
import {
  ApiError,
  networkError,
  sessionExpiredError,
  timeoutError,
  toApiError,
} from './errors';

export type QueryValue = string | number | boolean | null | undefined | readonly string[];
export type Query = Record<string, QueryValue>;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  query?: Query;
  /** JSON body */
  body?: unknown;
  /** Multipart body (React Native sets the boundary) */
  form?: FormData;
  /** Abort signal — React Query passes one to every queryFn */
  signal?: AbortSignal;
  /** Send the access token and refresh on 401 (default true) */
  auth?: boolean;
  /** Override the default timeout */
  timeoutMs?: number;
}

/** Paginated list shape of the API (backend/src/common/pagination.ts). */
export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const parts: string[] = [];
  const add = (key: string, value: string) =>
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) (value as readonly string[]).forEach((v) => add(key, v));
    else add(key, String(value));
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Absolute URL of an API path ("/health" or "/api/health"). */
export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const clean = path.startsWith('/api/') ? path.slice(4) : path;
  return `${env.apiUrl}${clean.startsWith('/') ? clean : `/${clean}`}`;
}

const isAbort = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError';

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = options.auth === false ? null : getAuthBridge()?.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: FormData | string | undefined;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  // Timeout + caller cancellation share one controller
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? env.requestTimeoutMs);
  const onCallerAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onCallerAbort);

  try {
    return await fetch(`${apiUrl(path)}${buildQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) throw timeoutError();
    if (isAbort(error)) throw error; // cancelled by the caller (React Query)
    throw networkError();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }
}

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * The single HTTP entry point of the mobile app: JSON in/out, Bearer token,
 * one refresh on 401 then one retry, Arabic ApiError on failure. Never loops.
 *
 * The response type is the caller's declaration of the backend DTO: every
 * service must take it from the NestJS controller/DTO it calls.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);

  const bridge = options.auth === false ? null : getAuthBridge();
  if (response.status === 401 && bridge) {
    // Network/server errors of the refresh propagate as-is: offline ≠ signed out
    const outcome = await bridge.refresh();
    if (outcome === 'expired') {
      const error = sessionExpiredError();
      bridge.onSessionEnded('expired', error);
      throw error;
    }
    response = await send(path, options);
  }

  if (response.status === 204) return undefined as T;
  const data = parseBody(await response.text());
  if (!response.ok) {
    const error = toApiError(response.status, data);
    // Deactivated while signed in: the backend answers 403 ACCOUNT_INACTIVE
    if (bridge && error.status === 403 && error.code === 'ACCOUNT_INACTIVE')
      bridge.onSessionEnded('inactive', error);
    throw error;
  }
  return data as T;
}

export { ApiError };
