"use client"

import { useQueryClient } from "@tanstack/react-query"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

import { api, setSessionExpiredHandler } from "@/lib/api/client"
import {
  getSessionUser,
  login as apiLogin,
  logout as apiLogout,
  onSessionChange,
  refreshSession,
  setSession,
  type AuthResponse,
  type SessionUser,
} from "@/lib/api/session"

export type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous"

interface AuthContextValue {
  status: AuthStatus
  user: SessionUser | null
  /** Restores the session from the refresh cookie (once; workspaces and login call it). */
  restore: () => Promise<SessionUser | null>
  login: (username: string, password: string) => Promise<SessionUser>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<SessionUser>
  /** Re-reads the account (roles, profile) from the API. */
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Authentication state of the browser tab. The access token stays in
 * memory (lib/api/session); a page reload restores the session through the
 * HttpOnly refresh cookie. Any account change — login, logout, expiry,
 * another user — clears every cached query, so private data never crosses
 * accounts. Public pages never trigger a restore (no needless API call).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<SessionUser | null>(() => getSessionUser())
  const [status, setStatus] = useState<AuthStatus>(() => (getSessionUser() ? "authenticated" : "idle"))
  const restoring = useRef<Promise<SessionUser | null> | null>(null)
  const lastUserId = useRef<string | null>(getSessionUser()?.id ?? null)

  useEffect(
    () =>
      onSessionChange((next) => {
        if ((next?.id ?? null) !== lastUserId.current) {
          // Another account (or none): nothing cached may survive
          queryClient.clear()
          lastUserId.current = next?.id ?? null
        }
        setUser(next)
        setStatus(next ? "authenticated" : "anonymous")
      }),
    [queryClient]
  )

  useEffect(() => {
    setSessionExpiredHandler(() => {
      const here = window.location.pathname + window.location.search
      // A full page load on purpose: nothing from the expired session stays in memory
      if (!window.location.pathname.startsWith("/login"))
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/login?expired=1&next=${encodeURIComponent(here)}`)
    })
    return () => setSessionExpiredHandler(null)
  }, [])

  const restore = useCallback(() => {
    const known = getSessionUser()
    if (known) return Promise.resolve(known)
    restoring.current ??= (async () => {
      setStatus("loading")
      try {
        const restored = await refreshSession()
        if (!restored) setStatus("anonymous")
        return restored
      } catch {
        // API unreachable: treat as signed out (the login page explains the network error)
        setStatus("anonymous")
        return null
      } finally {
        restoring.current = null
      }
    })()
    return restoring.current
  }, [])

  const login = useCallback((username: string, password: string) => apiLogin(username, password), [])

  const logout = useCallback(async () => {
    await apiLogout()
    queryClient.clear()
  }, [queryClient])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const response = await api<AuthResponse>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    })
    setSession(response)
    return response.user
  }, [])

  const reload = useCallback(async () => {
    await refreshSession().catch(() => null)
  }, [])

  const value = useMemo(
    () => ({ status, user, restore, login, logout, changePassword, reload }),
    [status, user, restore, login, logout, changePassword, reload]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>")
  return context
}
