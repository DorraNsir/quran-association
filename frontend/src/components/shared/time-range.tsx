import { formatTimeRange } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { TimeOfDay } from "@/types/domain"

/**
 * A time range «09:00 – 11:00» in the Arabic (RTL) reading order: the START
 * time on the right — read first — and the END time on the left. Left in the
 * page's RTL direction on purpose (an LTR container would put the start on
 * the left, read last). Never wrapped in the middle, with aligned digits.
 * Every displayed time range uses this component; plain text (toasts,
 * dialogs, labels) uses `formatTimeRange`.
 */
export function TimeRange({ start, end, className }: { start: TimeOfDay; end: TimeOfDay; className?: string }) {
  return <span className={cn("inline-block whitespace-nowrap tabular-nums", className)}>{formatTimeRange(start, end)}</span>
}
