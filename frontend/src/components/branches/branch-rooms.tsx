"use client"

import { DoorOpen, PauseCircle, Pencil, PlayCircle, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { GroupBadge, StatusBadge } from "@/components/shared/badges"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionCard } from "@/components/shared/info-list"
import { Button } from "@/components/ui/button"
import { activeSchedulesIn, indexLookups, weeklyMinutes, type Lookups } from "@/lib/domain"
import { countLabels, formatDuration } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Branch, Room } from "@/types/domain"

import { RoomDialog } from "./room-dialog"

type DialogState = { kind: "form" | "deactivate"; room?: Room; key: number; open: boolean }

const mockSaved = { description: labels.common.mockNotice }

/** Rooms of one branch, with how much each is used by active groups. */
export function BranchRooms({ branch, lookups }: { branch: Branch; lookups: Lookups }) {
  const [rooms, setRooms] = useState(lookups.rooms)
  const [state, setState] = useState<DialogState | null>(null)
  const { classesById, groupsById } = indexLookups(lookups)
  const branchRooms = rooms.filter((r) => r.branchId === branch.id)

  const close = (open: boolean) => {
    if (!open) setState((s) => (s ? { ...s, open: false } : s))
  }
  const open = (kind: DialogState["kind"], room?: Room) =>
    setState({ kind, room, key: Date.now(), open: true })

  function save(room: Room, message: string) {
    setRooms((prev) => (prev.some((r) => r.id === room.id) ? prev.map((r) => (r.id === room.id ? room : r)) : [...prev, room]))
    toast.success(message, mockSaved)
    close(false)
  }

  /** Slots of running classes whose room this is */
  const usageOf = (room: Room) => activeSchedulesIn({ roomId: room.id }, { ...lookups, rooms })
  const pending = state?.room
  const pendingUsage = pending ? usageOf(pending) : []

  return (
    <div id="rooms" className="scroll-mt-20">
    <SectionCard
      title="القاعات"
      icon={DoorOpen}
      action={
        <Button size="sm" variant="outline" onClick={() => open("form")}>
          <Plus />
          إضافة قاعة
        </Button>
      }
    >
      {branchRooms.length === 0 ? (
        <EmptyState icon={DoorOpen} title="لا توجد قاعات" description="أضف قاعات الفرع لتتمكن من برمجة الحصص فيها." className="py-6" />
      ) : (
        <ul className="divide-y">
          {branchRooms.map((room) => {
            const usage = usageOf(room)
            const classIds = [...new Set(usage.map((s) => s.groupClassId))]
            return (
              <li key={room.id} className="relative flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      room.status === "ACTIVE" ? "bg-muted text-foreground" : "bg-muted/50 text-muted-foreground"
                    )}
                  >
                    <DoorOpen className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {room.name}
                      <StatusBadge status={room.status} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {usage.length > 0
                        ? `${countLabels.sessions(usage.length)} · ${formatDuration(weeklyMinutes(usage))} أسبوعيًا`
                        : "غير مستعملة حاليًا"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 ps-12 sm:ps-0">
                  {classIds.map((id) => {
                    const group = groupsById.get(classesById.get(id)?.groupId ?? "")
                    return group ? <GroupBadge key={id} name={group.name} href={`/admin/groups/${group.id}`} /> : null
                  })}
                </div>
                <div className="absolute end-0 top-3 sm:static">
                  <ActionsMenu
                    label={`إجراءات ${room.name}`}
                    actions={[
                      { label: "تعديل", icon: Pencil, onSelect: () => open("form", room) },
                      room.status === "ACTIVE"
                        ? { label: "إيقاف القاعة", icon: PauseCircle, destructive: true, separated: true, onSelect: () => open("deactivate", room) }
                        : {
                            label: "إعادة التفعيل",
                            icon: PlayCircle,
                            separated: true,
                            onSelect: () => save({ ...room, status: "ACTIVE" }, `تم تفعيل ${room.name}`),
                          },
                    ]}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {state?.kind === "form" && (
        <RoomDialog
          key={state.key}
          open={state.open}
          onOpenChange={close}
          room={pending}
          defaultBranchId={branch.id}
          branches={lookups.branches}
          rooms={rooms}
          onSave={(room) =>
            save(
              room,
              room.branchId !== branch.id
                ? `تم نقل ${room.name} إلى فرع آخر`
                : pending
                  ? `تم حفظ ${room.name}`
                  : `تمت إضافة ${room.name}`
            )
          }
        />
      )}
      {state?.kind === "deactivate" && pending && (
        <ConfirmDialog
          open={state.open}
          onOpenChange={close}
          destructive
          title={`إيقاف ${pending.name}؟`}
          description={
            pendingUsage.length > 0
              ? `تُستعمل هذه القاعة في ${countLabels.sessions(pendingUsage.length)} أسبوعيًا. يجب نقل هذه الحصص إلى قاعة أخرى من الرزنامة أو من صفحة المجموعة.`
              : "لن تظهر القاعة عند برمجة الحصص الجديدة."
          }
          confirmLabel="إيقاف القاعة"
          onConfirm={() => save({ ...pending, status: "INACTIVE" }, `تم إيقاف ${pending.name}`)}
        />
      )}
    </SectionCard>
    </div>
  )
}
