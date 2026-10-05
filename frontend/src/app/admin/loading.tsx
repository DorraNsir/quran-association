import { Skeleton } from "@/components/ui/skeleton"

/** Shown while a route's data loads (mock data is instant today; the API won't be). */
export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="space-y-2 rounded-xl border bg-card p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
