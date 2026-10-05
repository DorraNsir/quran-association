"use client"

import { BookOpen, CalendarDays, ClipboardCheck, Clock, DoorOpen, MapPin, Pencil, Trash2, Users } from "lucide-react"
import Link from "next/link"

import { SessionStatusBadge } from "@/components/attendance/attendance-badges"
import { StatusBadge, TeacherRoleBadge } from "@/components/shared/badges"
import { InfoList } from "@/components/shared/info-list"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { useDirection } from "@/components/ui/direction"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { fullName } from "@/lib/domain"
import { countLabels, formatDate, formatDuration, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { ISODate } from "@/types/domain"

import type { CalendarEntry } from "./calendar-event"
import { toMinutes } from "./calendar-utils"

export function ScheduleDetailsSheet({
  entry,
  date,
  open,
  onOpenChange,
  onEdit,
  onRemove,
}: {
  entry: CalendarEntry | null
  /** The occurrence date shown in the calendar (the session itself recurs weekly) */
  date?: ISODate
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (entry: CalendarEntry) => void
  onRemove: (entry: CalendarEntry) => void
}) {
  const dir = useDirection()
  if (!entry) return null
  const { schedule, group, branch, room, supervisor, assistants } = entry

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={dir === "rtl" ? "left" : "right"}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-md data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="size-5 text-primary" aria-hidden />
            {group.name}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            حصة أسبوعية · {group.audience}
            {group.status !== "ACTIVE" && <StatusBadge status={group.status} />}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <InfoList
            items={[
              {
                label: "اليوم",
                value: `كل ${labels.weekday[schedule.day]}${date ? ` · ${formatDate(date)}` : ""}`,
                icon: CalendarDays,
              },
              {
                label: "التوقيت",
                value: (
                  <>
                    <span dir="ltr" className="tabular-nums">{formatTimeRange(schedule.start, schedule.end)}</span>
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                      ({formatDuration(toMinutes(schedule.end) - toMinutes(schedule.start))})
                    </span>
                  </>
                ),
                icon: Clock,
              },
              { label: "الفرع", value: branch?.name, icon: MapPin },
              { label: "القاعة", value: room?.name, icon: DoorOpen },
              { label: "عدد الطلبة", value: countLabels.students(entry.studentCount), icon: Users },
            ]}
          />

          {entry.occurrence && (
            <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">حصة {formatDate(entry.occurrence.date)}</h3>
                <SessionStatusBadge status={entry.occurrence.status} />
              </div>
              {entry.occurrence.status === "CANCELLED" && (
                <p className="text-xs text-muted-foreground">
                  أُلغيت هذه الحصة فقط{entry.occurrence.cancellationReason ? ` (${entry.occurrence.cancellationReason})` : ""}؛ البرنامج الأسبوعي لم يتغيّر.
                </p>
              )}
              <Button asChild size="sm" className="w-full">
                <Link href={`/admin/sessions/${entry.occurrence.id}`}>
                  <ClipboardCheck />
                  الحصة وتسجيل الحضور
                </Link>
              </Button>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">فريق التدريس</h3>
            {supervisor && (
              <div className="flex items-center justify-between gap-2">
                <Link href={`/admin/teachers/${supervisor.id}`} className="min-w-0 hover:opacity-80">
                  <PersonCell name={fullName(supervisor)} size="sm" />
                </Link>
                <TeacherRoleBadge role="SUPERVISOR" />
              </div>
            )}
            {assistants.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <Link href={`/admin/teachers/${t.id}`} className="min-w-0 hover:opacity-80">
                  <PersonCell name={fullName(t)} size="sm" />
                </Link>
                <TeacherRoleBadge role="ASSISTANT" />
              </div>
            ))}
            {assistants.length === 0 && <p className="text-xs text-muted-foreground">بدون معلم مساعد</p>}
          </section>
        </div>

        <SheetFooter className="flex-row flex-wrap gap-2 border-t bg-muted/30 px-6 py-4">
          <Button asChild variant="outline">
            <Link href={`/admin/groups/${group.id}`}>
              <BookOpen />
              عرض المجموعة
            </Link>
          </Button>
          <Button onClick={() => onEdit(entry)}>
            <Pencil />
            تعديل الحصة
          </Button>
          <Button variant="destructive" className="ms-auto" onClick={() => onRemove(entry)}>
            <Trash2 />
            إلغاء الحصة
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
