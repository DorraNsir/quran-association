"use client"

import { BookOpen, CheckCircle2, DoorOpen, Info } from "lucide-react"

import { ClassPicker } from "@/components/groups/class-picker"
import { ConflictAlert } from "@/components/scheduling/conflict-alert"
import { TeacherRoleBadge } from "@/components/shared/badges"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { PersonCell } from "@/components/shared/user-avatar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFormState } from "@/hooks/use-form-state"
import { describeClass, fullName, indexLookups, type Lookups } from "@/lib/domain"
import { labels, WEEK_ORDER } from "@/lib/i18n"
import { newMockId } from "@/lib/mock/reference-date"
import { findConflicts, freeRooms, isValidTimeRange } from "@/lib/scheduling"
import type { ID, Student, Weekday, WeeklySchedule } from "@/types/domain"

type ScheduleValues = Omit<WeeklySchedule, "id">

export type SchedulePreset = Partial<ScheduleValues> & {
  /** Room clicked in the rooms view — only a hint: the class decides the room */
  roomId?: ID
}

/**
 * Adds or edits one weekly slot of a class. The class is chosen (group →
 * class); its branch, room and teachers follow and are checked for conflicts.
 */
export function ScheduleFormSheet({
  open,
  onOpenChange,
  schedule,
  preset,
  lookups,
  students,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing an existing slot (its class cannot change) */
  schedule?: WeeklySchedule
  /** Values from the clicked slot (day, start, end, room hint…) when creating */
  preset?: SchedulePreset
  lookups: Lookups
  students?: Student[]
  onSave: (schedule: WeeklySchedule) => void
}) {
  const indexes = indexLookups(lookups)
  const form = useFormState<ScheduleValues>(
    `schedule-${schedule?.id ?? "new"}`,
    {
      groupClassId: schedule?.groupClassId ?? preset?.groupClassId ?? "",
      day: schedule?.day ?? preset?.day ?? "SAT",
      start: schedule?.start ?? preset?.start ?? "09:00",
      end: schedule?.end ?? preset?.end ?? "11:00",
    },
    (v) => ({
      groupClassId: v.groupClassId ? undefined : "اختر المجموعة ثم الحلقة",
      end: isValidTimeRange(v.start, v.end) ? undefined : "يجب أن تكون ساعة النهاية بعد ساعة البداية",
    })
  )
  const { values, setField } = form
  const groupClass = indexes.classesById.get(values.groupClassId)
  const view = groupClass ? describeClass(groupClass, indexes) : undefined

  const context = {
    schedules: lookups.schedules,
    groupClasses: lookups.groupClasses,
    groups: lookups.groups,
    ignoreScheduleIds: schedule ? [schedule.id] : [],
  }
  const complete = groupClass && isValidTimeRange(values.start, values.end)
  const conflicts = complete ? findConflicts({ ...values, id: schedule?.id, groupClass }, context) : []
  const alternatives = complete ? freeRooms(values, groupClass.branchId, lookups.rooms, context) : []
  const roomHint = preset?.roomId && groupClass && preset.roomId !== groupClass.roomId ? indexes.roomsById.get(preset.roomId) : undefined

  const submit = form.handleSubmit((v) => {
    if (conflicts.length > 0) return
    onSave({ ...v, id: schedule?.id ?? newMockId("ws") })
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={schedule ? "تعديل الحصة الأسبوعية" : "برمجة حصة أسبوعية"}
      description="تتكرر الحصة كل أسبوع في نفس اليوم والتوقيت، في قاعة الحلقة ومع معلميها."
      onSubmit={submit}
      submitLabel={schedule ? "حفظ التعديلات" : "برمجة الحصة"}
      submitDisabled={conflicts.length > 0}
    >
      <FormSection title="الحلقة">
        <FormField label="المجموعة والحلقة" required className="sm:col-span-2" {...form.field("groupClassId")}>
          {schedule && view ? (
            <p className="flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm">
              <BookOpen className="size-4 text-primary" aria-hidden />
              {view.group?.name} · {view.branch?.name}
            </p>
          ) : (
            <ClassPicker
              id={form.field("groupClassId").id}
              value={values.groupClassId}
              onChange={(id) => {
                setField("groupClassId", id)
                form.touch("groupClassId")
              }}
              lookups={lookups}
              students={students}
              invalid={Boolean(form.field("groupClassId").error)}
            />
          )}
        </FormField>
        {view && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DoorOpen className="size-3.5" aria-hidden />
              {view.branch?.name} · {view.room?.name} — من بيانات الحلقة
            </p>
            {view.supervisor && (
              <div className="flex items-center justify-between gap-2">
                <PersonCell name={fullName(view.supervisor)} size="sm" />
                <TeacherRoleBadge role="SUPERVISOR" />
              </div>
            )}
            {view.assistants.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <PersonCell name={fullName(t)} size="sm" />
                <TeacherRoleBadge role="ASSISTANT" />
              </div>
            ))}
          </div>
        )}
        {roomHint && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning sm:col-span-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            اخترت خانة في {roomHint.name}، لكن هذه الحلقة تدرس في {view?.room?.name}. القاعة تتبع الحلقة.
          </p>
        )}
      </FormSection>

      <FormSection title="الموعد">
        <FormField label="اليوم" required className="sm:col-span-2" {...form.field("day")}>
          <Select value={values.day} onValueChange={(d) => setField("day", d as Weekday)}>
            <SelectTrigger id={form.field("day").id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {WEEK_ORDER.map((d) => (
                <SelectItem key={d} value={d}>
                  {labels.weekday[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="من" required {...form.field("start")}>
          <Input type="time" dir="ltr" step={900} {...form.inputProps("start")} />
        </FormField>
        <FormField label="إلى" required {...form.field("end")}>
          <Input type="time" dir="ltr" step={900} {...form.inputProps("end")} />
        </FormField>

        <div className="sm:col-span-2">
          {conflicts.length > 0 ? (
            <ConflictAlert
              conflicts={conflicts}
              lookups={lookups}
              freeRooms={alternatives}
              pickRoomHint="قاعات متاحة في نفس الفرع (تُغيَّر قاعة الحلقة من صفحة المجموعة):"
            />
          ) : (
            complete && (
              <p className="flex items-center gap-1.5 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-soft-foreground">
                <CheckCircle2 className="size-4" aria-hidden />
                {view?.room?.name} والمعلمون متاحون في هذا الوقت.
              </p>
            )
          )}
        </div>
      </FormSection>
    </FormSheet>
  )
}
