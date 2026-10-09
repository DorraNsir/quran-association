"use client"

import { AlertTriangle, DoorOpen } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { describeClass, fullName, indexLookups, type Lookups } from "@/lib/domain"
import { formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ConflictType, ID, Room, ScheduleConflict } from "@/types/domain"

const ORDER: ConflictType[] = ["ROOM", "TEACHER", "CLASS"]

/**
 * Explains WHY a session can't be scheduled: which room/teacher is busy,
 * with which group, and when — plus free rooms to pick instead.
 */
export function ConflictAlert({
  conflicts,
  lookups,
  freeRooms = [],
  onPickRoom,
  pickRoomHint = "قاعات متاحة في نفس الفرع خلال هذا الوقت:",
  className,
}: {
  conflicts: ScheduleConflict[]
  lookups: Lookups
  freeRooms?: Room[]
  onPickRoom?: (roomId: ID) => void
  pickRoomHint?: string
  className?: string
}) {
  if (conflicts.length === 0) return null
  const indexes = indexLookups(lookups)
  const { classesById, teachersById } = indexes
  const hasRoomConflict = conflicts.some((c) => c.type === "ROOM")

  return (
    <Alert
      className={cn("border-destructive/30 bg-destructive/5 text-destructive", className)}
      aria-live="polite"
    >
      <AlertTriangle />
      <AlertTitle>تعارض في البرمجة</AlertTitle>
      <AlertDescription className="space-y-3 text-foreground">
        {ORDER.map((type) => {
          const items = conflicts.filter((c) => c.type === type)
          if (items.length === 0) return null
          return (
            <div key={type} className="space-y-1.5">
              <p className="font-medium text-destructive">
                {labels.conflict[type].title} — {labels.conflict[type].message}
              </p>
              <ul className="space-y-1.5">
                {items.map((c) => {
                  // The other slot's class gives its group, place and supervisor
                  const other = classesById.get(c.schedule.groupClassId)
                  const view = other ? describeClass(other, indexes) : undefined
                  const group = view?.group
                  const when = (
                    <span className="text-muted-foreground">
                      {labels.weekday[c.schedule.day]}{" "}
                      <span dir="ltr" className="tabular-nums">
                        {formatTimeRange(c.schedule.start, c.schedule.end)}
                      </span>
                    </span>
                  )
                  return (
                    <li
                      key={`${c.type}-${c.schedule.id}-${c.teacherIds.join()}`}
                      className="rounded-md border border-destructive/20 bg-card px-2.5 py-2"
                    >
                      {c.type === "ROOM" && (
                        <p>
                          <strong className="font-medium">{view?.room?.name}</strong>{" "}
                          محجوزة لـ <strong className="font-medium">{group?.name}</strong>
                          {view?.supervisor && ` (${fullName(view.supervisor)})`} · {when}
                        </p>
                      )}
                      {c.type === "TEACHER" && (
                        <p>
                          <strong className="font-medium">
                            {c.teacherIds
                              .map((id) => teachersById.get(id))
                              .filter((t) => t !== undefined)
                              .map(fullName)
                              .join("، ")}
                          </strong>{" "}
                          يدرّس في <strong className="font-medium">{group?.name}</strong> · {when}
                          <span className="block text-xs text-muted-foreground">
                            {view?.branch?.name} · {view?.room?.name}
                          </span>
                        </p>
                      )}
                      {c.type === "CLASS" && <p>حصة أخرى لنفس القسم · {when}</p>}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        {hasRoomConflict && (
          <div className="space-y-1.5 border-t border-destructive/20 pt-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DoorOpen className="size-3.5" aria-hidden />
              {freeRooms.length > 0 ? pickRoomHint : "لا توجد قاعة متاحة في هذا الفرع خلال هذا الوقت."}
            </p>
            {freeRooms.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {freeRooms.map((room) => (
                  <Button
                    key={room.id}
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={!onPickRoom}
                    onClick={() => onPickRoom?.(room.id)}
                  >
                    {room.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
