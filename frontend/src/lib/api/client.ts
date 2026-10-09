import { API_URL } from "./config"
import { ApiError, networkError, toApiError } from "./errors"
import { clearSession, getAccessToken, refreshSession, setSession, type AuthResponse } from "./session"

export type Query = Record<string, string | number | boolean | null | undefined | string[]>

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  query?: Query
  /** JSON body */
  body?: unknown
  /** Multipart body (the browser sets the boundary) */
  form?: FormData
  signal?: AbortSignal
  /** Send the access token (default true) */
  auth?: boolean
}

export function buildQuery(query?: Query) {
  if (!query) return ""
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
    else params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ""
}

/** Notified when the session is definitively gone (refresh failed). */
let onExpired: (() => void) | null = null
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onExpired = handler
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {}
  const token = getAccessToken()
  if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (options.form) body = options.form
  else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(options.body)
  }
  try {
    return await fetch(`${API_URL}${path}${buildQuery(options.query)}`, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: options.signal,
      credentials: "include",
    })
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error
    throw networkError()
  }
}

/**
 * The single HTTP entry point of the frontend: JSON in/out, Bearer token,
 * one transparent refresh on 401 (then the request is retried once), Arabic
 * ApiError on failure. A failed refresh clears the session and notifies
 * the auth layer (redirect to login) — never an infinite loop.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options)
  if (response.status === 401 && options.auth !== false) {
    const user = await refreshSession().catch(() => null)
    if (!user) {
      clearSession()
      onExpired?.()
      throw toApiError(401, { code: "SESSION_EXPIRED" })
    }
    response = await send(path, options)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const data = text ? safeJson(text) : undefined
  if (!response.ok) throw toApiError(response.status, data)
  return data as T
}

function safeJson(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/** Login / refresh / change-password answers carry new tokens. */
export function adoptAuthResponse(response: AuthResponse) {
  setSession(response)
  return response.user
}

/** Paginated list shape of the API. */
export interface Page<T> {
  data: T[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

/**
 * Every item of a paginated collection (pages of 100). For reference data
 * the association keeps small (branches, rooms, groups, classes, teachers,
 * students); bounded to protect the browser.
 */
export async function fetchAll<T>(path: string, query: Query = {}, signal?: AbortSignal, maxPages = 50): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= maxPages; page++) {
    const result = await api<Page<T> | T[]>(path, { query: { ...query, page, pageSize: 100 }, signal })
    // Short reference lists (academic years, weekly slots) are not paginated by the API
    if (Array.isArray(result)) return result
    items.push(...result.data)
    if (page >= result.meta.totalPages) break
  }
  return items
}

/**
 * Multipart upload with progress (XMLHttpRequest: fetch has no upload
 * progress). Same token/refresh rules as api(); returns the file metadata.
 */
export function uploadFile<T>(
  path: string,
  query: Query,
  file: File,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}
): Promise<T> {
  const attempt = () =>
    new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", `${API_URL}${path}${buildQuery(query)}`)
      xhr.withCredentials = true
      const token = getAccessToken()
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) options.onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
      xhr.onload = () => resolve({ status: xhr.status, body: safeJson(xhr.responseText) })
      xhr.onerror = () => reject(networkError())
      xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"))
      options.signal?.addEventListener("abort", () => xhr.abort())
      const form = new FormData()
      form.append("file", file)
      xhr.send(form)
    })
  return (async () => {
    let result = await attempt()
    if (result.status === 401) {
      const user = await refreshSession().catch(() => null)
      if (!user) {
        clearSession()
        onExpired?.()
        throw toApiError(401, { code: "SESSION_EXPIRED" })
      }
      result = await attempt()
    }
    if (result.status < 200 || result.status >= 300) throw toApiError(result.status, result.body)
    return result.body as T
  })()
}

/**
 * Bytes of a private file (Bearer token required — a plain <img src> cannot
 * send it). Returns a Blob; callers make an object URL and revoke it.
 */
export async function fetchPrivateBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const url = path.startsWith("/api/") ? path.slice(4) : path
  const run = () =>
    fetch(`${API_URL}${url}`, {
      headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {},
      credentials: "include",
      signal,
      cache: "no-store",
    })
  let response: Response
  try {
    response = await run()
    if (response.status === 401 && (await refreshSession().catch(() => null))) response = await run()
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error
    throw networkError()
  }
  if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null))
  return response.blob()
}

export { ApiError }
