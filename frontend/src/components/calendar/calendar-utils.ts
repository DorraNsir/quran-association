import { addDays, startOfWeek } from "@/lib/dates"
import { formatDateRange } from "@/lib/format"
import type { TimeOfDay, WeeklySchedule } from "@/types/domain"

export function formatWeekRange(date: string) {
  const start = startOfWeek(date)
  return formatDateRange(start, addDays(start, 6))
}

export function toMinutes(time: TimeOfDay) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function fromMinutes(total: number): TimeOfDay {
  const clamped = Math.max(0, Math.min(total, 23 * 60 + 59))
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`
}

/** Visible hours: at least 08:00–21:00, widened to fit every session. */
export function visibleHours(schedules: WeeklySchedule[]) {
  const first = Math.min(8, ...schedules.map((s) => Math.floor(toMinutes(s.start) / 60)))
  const last = Math.max(21, ...schedules.map((s) => Math.ceil(toMinutes(s.end) / 60)))
  return { first, last }
}

export interface LaidOut<T> {
  item: T
  /** 0-based lane and total lanes in its overlap cluster — sets inline position and width */
  lane: number
  lanes: number
}

/** Side-by-side layout for sessions that overlap in one column (e.g. two rooms at 09:00). */
export function layoutLanes<T extends { start: TimeOfDay; end: TimeOfDay }>(items: T[]): LaidOut<T>[] {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
  const result: LaidOut<T>[] = []
  let cluster: LaidOut<T>[] = []
  let laneEnds: string[] = []
  let clusterEnd = ""

  const flush = () => {
    for (const entry of cluster) entry.lanes = laneEnds.length
    result.push(...cluster)
    cluster = []
    laneEnds = []
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    clusterEnd = cluster.length === 0 || item.end > clusterEnd ? item.end : clusterEnd
    cluster.push({ item, lane, lanes: 0 })
  }
  flush()
  return result
}
