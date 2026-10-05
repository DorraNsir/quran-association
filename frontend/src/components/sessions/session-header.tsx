import { BookOpen, CalendarDays, Clock, DoorOpen, MapPin } from "lucide-react"

import { SessionStatusBadge } from "@/components/attendance/attendance-badges"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { formatTimeRange, formatWeekdayDate } from "@/lib/format"

import type { SessionRow } from "./use-session-rows"

/** Who / when / where of one dated session, shared by its details and attendance pages. */
export function SessionHeader({ row, actions }: { row: SessionRow; actions?: React.ReactNode }) {
  const { session, group, branch, room } = row
  return (
    <ProfileHeader
      name={group?.name ?? "—"}
      avatar={
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-foreground sm:size-20">
          <BookOpen className="size-6 sm:size-8" aria-hidden />
        </span>
      }
      badges={<SessionStatusBadge status={session.status} />}
      meta={
        <>
          <MetaItem icon={CalendarDays}>{formatWeekdayDate(session.date)}</MetaItem>
          <MetaItem icon={Clock}>
            <span dir="ltr" className="tabular-nums">{formatTimeRange(session.start, session.end)}</span>
          </MetaItem>
          <MetaItem icon={MapPin}>{branch?.name}</MetaItem>
          <MetaItem icon={DoorOpen}>{room?.name}</MetaItem>
        </>
      }
      actions={actions}
    />
  )
}
