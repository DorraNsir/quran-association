import { QueryClient } from "@tanstack/react-query"

import { ApiError } from "./errors"

/**
 * One QueryClient per browser tab (a fresh one per server render). Server
 * state lives here only; it holds the signed-in user's private data, so it
 * is cleared on logout, session expiry and account change (AuthProvider).
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // Client errors (400–499) are answers, not glitches: never retried
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  })
}

let browserClient: QueryClient | undefined
export function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient()
  browserClient ??= makeQueryClient()
  return browserClient
}
