"use client"

import { FormField } from "@/components/shared/form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFormState } from "@/hooks/use-form-state"
import { labels } from "@/lib/i18n"
import { newMockId } from "@/lib/mock/reference-date"
import { requiredText } from "@/lib/validation"
import type { Branch, Room, RoomStatus } from "@/types/domain"

interface RoomFormValues {
  name: string
  branchId: string
  status: RoomStatus
}

/** Small dialog: rooms only have a name, a branch and a status by design. */
export function RoomDialog({
  open,
  onOpenChange,
  room,
  defaultBranchId,
  branches,
  rooms,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  room?: Room
  defaultBranchId: string
  branches: Branch[]
  /** All rooms, to prevent duplicate names inside a branch */
  rooms: Room[]
  onSave: (room: Room) => void
}) {
  const form = useFormState<RoomFormValues>(
    `room-${room?.id ?? "new"}`,
    {
      name: room?.name ?? "",
      branchId: room?.branchId ?? defaultBranchId,
      status: room?.status ?? "ACTIVE",
    },
    (v) => ({
      name:
        requiredText(v.name, "اسم القاعة مطلوب") ??
        (rooms.some((r) => r.id !== room?.id && r.branchId === v.branchId && r.name.trim() === v.name.trim())
          ? "توجد قاعة بهذا الاسم في نفس الفرع"
          : undefined),
      branchId: v.branchId ? undefined : "اختر الفرع",
    })
  )

  const submit = form.handleSubmit((v) =>
    onSave({ id: room?.id ?? newMockId("room"), name: v.name.trim(), branchId: v.branchId, status: v.status })
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{room ? `تعديل ${room.name}` : "إضافة قاعة"}</DialogTitle>
            <DialogDescription>القاعات تُستعمل في برمجة حصص المجموعات.</DialogDescription>
          </DialogHeader>
          <FormField label="اسم القاعة" required {...form.field("name")}>
            <Input placeholder="مثال: القاعة 4" {...form.inputProps("name")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="الفرع" required {...form.field("branchId")}>
              <Select value={form.values.branchId} onValueChange={(v) => form.setField("branchId", v)}>
                <SelectTrigger id={form.field("branchId").id} className="w-full">
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="الحالة" required {...form.field("status")}>
              <Select
                value={form.values.status}
                onValueChange={(v) => form.setField("status", v as RoomStatus)}
              >
                <SelectTrigger id={form.field("status").id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="ACTIVE">{labels.status.ACTIVE}</SelectItem>
                  <SelectItem value="INACTIVE">{labels.status.INACTIVE}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {labels.common.cancel}
            </Button>
            <Button type="submit">{room ? "حفظ" : "إضافة القاعة"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
