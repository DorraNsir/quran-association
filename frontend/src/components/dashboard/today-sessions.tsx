"use client"

import { CalendarCheck2, CalendarX2, MapPin, ShieldCheck, Users } from "lucide-react"
import Link from "next/link"

import { AttendanceStateLabel } from "@/components/attendance/attendance-badges"
import { AttendanceAction } from "@/components/sessions/attendance-action"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionCard } from "@/components/shared/info-list"
import { QueryState } from "@/components/shared/query-state"
import { Button } from "@/components/ui/button"
import { toSessionRow, useSessionRange } from "@/lib/api/sessions"
import { weekdayOf } from "@/lib/dates"
import { fullName, type Lookups } from "@/lib/domain"
import { countLabels, formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { ISODate } from "@/types/domain"

/** "Which groups meet today, where, with whom — and is attendance recorded?" */
export function TodaySessions({ today, lookups }: { today: ISODate; lookups: Lookups }) {
  const query = useSessionRange("admin", { from: today, to: today })
  const sessions = (query.data ?? []).map((s) => toSessionRow(s, today))
  const audienceOf = (groupId: string) => lookups.groups.find((g) => g.id === groupId)?.audience

  return (
    <SectionCard
      title={`حصص اليوم — ${labels.weekday[weekdayOf(today)]} ${formatDate(today)}`}
      icon={CalendarCheck2}
      className="lg:col-span-2"
      action={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{countLabels.sessions(sessions.length)}</span>
          <Button asChild variant="ghost" size="sm" className="text-primary">
            <Link href="/admin/sessions">كل الحصص</Link>
          </Button>
        </div>
      }
    >
      <QueryState query={query}>
      {sessions.length === 0 ? (
        <EmptyState icon={CalendarX2} title="لا توجد حصص اليوم" className="py-6" />
      ) : (
        <ol className="space-y-2">
          {sessions.map((row) => {
            const { session, group, supervisor } = row
            return (
              <li
                key={session.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <Link
                  href={`/admin/sessions/${session.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-2 hover:opacity-80 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-20 sm:flex-col sm:items-start sm:gap-0">
                    <span className="text-base font-semibold tabular-nums">{session.start}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{session.end}</span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 sm:border-s sm:ps-4">
                    <p className="font-medium">
                      {group?.name}
                      <span className="ms-2 text-xs font-normal text-muted-foreground">{audienceOf(group.id)}</span>
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {row.branch?.name} · {row.room?.name}
                      </span>
                      {supervisor && (
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="size-3.5 text-primary" aria-hidden />
                          {fullName(supervisor)}
                          {row.assistants.length > 0 && ` + ${row.assistants.length}`}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden />
                        {countLabels.students(row.expected)}
                      </span>
                    </div>
                    <AttendanceStateLabel {...row.progress} className="text-xs" />
                  </div>
                </Link>
                <AttendanceAction row={row} today={today} />
              </li>
            )
          })}
        </ol>
      )}
      </QueryState>
    </SectionCard>
  )
}
