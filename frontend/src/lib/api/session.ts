import { API_URL } from "./config"
import { networkError, toApiError } from "./errors"

/** The signed-in account, as returned by the API (MeDto). */
export interface SessionUser {
  id: string
  username: string
  person: {
    id: string
    firstName: string
    lastName: string
    photoUrl: string | null
    email: string | null
    phone: string | null
  }
  roles: ("ADMIN" | "TEACHER" | "STUDENT")[]
  mustChangePassword: boolean
  teacherId: string | null
  studentId: string | null
}

export interface AuthResponse {
  accessToken: string
  expiresIn: number
  user: SessionUser
}

type Listener = (user: SessionUser | null) => void

/**
 * The access token lives in memory only (never localStorage); the refresh
 * token is an HttpOnly cookie the browser sends to /api/auth/* by itself.
 * One refresh at a time: concurrent 401s share the same in-flight request,
 * so a rotating refresh token is never replayed by two parallel calls.
 */
let accessToken: string | null = null
let currentUser: SessionUser | null = null
let refreshing: Promise<SessionUser | null> | null = null
const listeners = new Set<Listener>()

export const getAccessToken = () => accessToken
export const getSessionUser = () => currentUser

export function setSession(response: AuthResponse) {
  accessToken = response.accessToken
  currentUser = response.user
  listeners.forEach((l) => l(currentUser))
}

export function clearSession() {
  const had = accessToken !== null || currentUser !== null
  accessToken = null
  currentUser = null
  if (had) listeners.forEach((l) => l(null))
}

export function onSessionChange(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Restores / renews the session from the refresh cookie. Resolves to the
 * user, or null when there is no valid session (never throws for 401).
 */
export function refreshSession(): Promise<SessionUser | null> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" })
      if (!response.ok) {
        clearSession()
        return null
      }
      const body = (await response.json()) as AuthResponse
      setSession(body)
      return body.user
    } catch {
      // Offline / API down: keep the current state, let the caller decide
      throw networkError()
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Signs in; the API sets the refresh cookie. */
export async function login(username: string, password: string): Promise<SessionUser> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw networkError()
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(response.status, body)
  setSession(body as AuthResponse)
  return (body as AuthResponse).user
}

/** Ends the session server-side (revokes the refresh token) and forgets it locally. */
export async function logout() {
  try {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" })
  } catch {
    // The local session is cleared anyway
  } finally {
    clearSession()
  }
}
