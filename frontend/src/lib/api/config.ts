/**
 * Where the NestJS API lives. NEXT_PUBLIC_API_URL is inlined at build time
 * for the browser (e.g. http://localhost:4000/api); server components may
 * use API_INTERNAL_URL (same API reached from the Next.js server) instead.
 */
const DEFAULT_API_URL = "http://localhost:4000/api"

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "")

export function serverApiUrl() {
  return (process.env.API_INTERNAL_URL ?? API_URL).replace(/\/+$/, "")
}

/** Absolute URL of an API path ("/public/files/…" or "/api/public/files/…"). */
export function apiUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path
  const clean = path.startsWith("/api/") ? path.slice(4) : path
  return `${API_URL}${clean.startsWith("/") ? clean : `/${clean}`}`
}
