"use client"

import { AlertTriangle, Inbox, Loader2, RotateCw, ShieldAlert, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError, errorMessage } from "@/lib/api/errors"

import { EmptyState } from "./empty-state"

interface QueryLike {
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

/**
 * The four states of server data, the same everywhere: loading, error
 * (Arabic message, retry; 403 → access message), empty, content. Never
 * falls back to mock data.
 */
export function QueryState({
  query,
  empty,
  emptyIcon = Inbox,
  emptyTitle = "لا توجد بيانات",
  emptyDescription,
  loadingLabel = "جارٍ التحميل…",
  children,
}: {
  query: QueryLike | QueryLike[]
  empty?: boolean
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
  loadingLabel?: string
  children: React.ReactNode
}) {
  const queries = Array.isArray(query) ? query : [query]
  const failed = queries.find((q) => q.isError)
  if (failed) return <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => q.isError && q.refetch())} />
  if (queries.some((q) => q.isPending)) return <LoadingState label={loadingLabel} />
  if (empty) return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
  return <>{children}</>
}

export function LoadingState({ label = "جارٍ التحميل…", className }: { label?: string; className?: string }) {
  return (
    <div className={className ?? "flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground"} role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const forbidden = error instanceof ApiError && error.isForbidden
  return (
    <EmptyState
      icon={forbidden ? ShieldAlert : AlertTriangle}
      title={forbidden ? "ليس لديك صلاحية للوصول إلى هذه البيانات" : "تعذّر تحميل البيانات"}
      description={errorMessage(error)}
      action={
        onRetry && !forbidden ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw />
            إعادة المحاولة
          </Button>
        ) : undefined
      }
    />
  )
}
