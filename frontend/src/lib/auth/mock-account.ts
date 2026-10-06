/**
 * PROTOTYPE ONLY — stands in for authentication until the backend exists.
 * The chosen mock account id is kept in a cookie so server layouts can
 * resolve "who is signed in" the same way a real session would.
 */
export const MOCK_ACCOUNT_COOKIE = "mock-account"

/** Client-side: switch the mock account (then refresh to re-render server layouts). */
export function setMockAccount(userId: string) {
  document.cookie = `${MOCK_ACCOUNT_COOKIE}=${encodeURIComponent(userId)}; path=/; max-age=31536000; samesite=lax`
}
