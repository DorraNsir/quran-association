"use client"

import { BookOpen, CheckCircle2 } from "lucide-react"

import { GroupSelect } from "@/components/groups/group-select"
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
import {
  fullName,
  groupTeacherIds,
  groupTeachers,
  indexLookups,
  roomsOfBranch,
  type Lookups,
} from "@/lib/domain"
import { labels, WEEK_ORDER } from "@/lib/i18n"
import { newMockId } from "@/lib/mock/reference-date"
import { findConflicts, freeRooms, isValidTimeRange } from "@/lib/scheduling"
import type { Weekday, WeeklySchedule } from "@/types/domain"

type ScheduleValues = Omit<WeeklySchedule, "id">

export type SchedulePreset = Partial<ScheduleValues>

export function ScheduleFormSheet({
  open,
  onOpenChange,
  schedule,
  preset,
  lookups,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing an existing session (its group cannot change) */
  schedule?: WeeklySchedule
  /** Values from the clicked slot (day, start, end, room…) when creating */
  preset?: SchedulePreset
  lookups: Lookups
  onSave: (schedule: WeeklySchedule) => void
}) {
  const { branchesById, groupsById, teachersById } = indexLookups(lookups)
  const presetGroup = preset?.groupId ? groupsById.get(preset.groupId) : undefined
  const presetBranchId = preset?.branchId ?? presetGroup?.branchId ?? ""

  const form = useFormState<ScheduleValues>(
    `schedule-${schedule?.id ?? "new"}`,
    {
      groupId: schedule?.groupId ?? preset?.groupId ?? "",
      day: schedule?.day ?? preset?.day ?? "SAT",
      start: schedule?.start ?? preset?.start ?? "09:00",
      end: schedule?.end ?? preset?.end ?? "11:00",
      branchId: schedule?.branchId ?? presetBranchId,
      roomId: schedule?.roomId ?? preset?.roomId ?? (presetGroup?.branchId === presetBranchId ? presetGroup.roomId : ""),
    },
    (v) => ({
      groupId: v.groupId ? undefined : "اختر المجموعة",
      end: isValidTimeRange(v.start, v.end) ? undefined : "يجب أن تكون ساعة النهاية بعد ساعة البداية",
      branchId: v.branchId ? undefined : "اختر الفرع",
      roomId: v.roomId ? undefined : "اختر القاعة",
    })
  )
  const { values, setField } = form
  const group = groupsById.get(values.groupId)
  const team = group ? groupTeachers(group, teachersById) : null

  const context = { schedules: lookups.schedules, groups: lookups.groups }
  const complete = group && values.roomId && isValidTimeRange(values.start, values.end)
  const conflicts = complete
    ? findConflicts({ ...values, id: schedule?.id, teacherIds: groupTeacherIds(group) }, {
        ...context,
        ignoreScheduleIds: schedule ? [schedule.id] : [],
      })
    : []
  const alternatives = complete
    ? freeRooms(values, values.branchId, lookups.rooms, { ...context, ignoreScheduleIds: schedule ? [schedule.id] : [] })
    : []

  const rooms = roomsOfBranch(values.branchId, lookups.rooms).filter(
    (r) => r.status === "ACTIVE" || r.id === values.roomId
  )

  const submit = form.handleSubmit((v) => {
    if (conflicts.length > 0) return
    onSave({ ...v, id: schedule?.id ?? newMockId("ws") })
  })

  function selectGroup(groupId: string) {
    const g = groupsById.get(groupId)
    setField("groupId", groupId)
    form.touch("groupId")
    // Default to the group's usual location unless a room was picked on the grid
    if (g && !preset?.roomId) {
      setField("branchId", g.branchId)
      setField("roomId", g.roomId)
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={schedule ? "تعديل الحصة" : "برمجة حصة أسبوعية"}
      description="تتكرر الحصة كل أسبوع في نفس اليوم والتوقيت."
      onSubmit={submit}
      submitLabel={schedule ? "حفظ التعديلات" : "برمجة الحصة"}
      submitDisabled={conflicts.length > 0}
    >
      <FormSection title="المجموعة">
        <FormField label="المجموعة" required className="sm:col-span-2" {...form.field("groupId")}>
          {schedule && group ? (
            <p className="flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm">
              <BookOpen className="size-4 text-primary" aria-hidden />
              {group.name}
            </p>
          ) : (
            <GroupSelect
              id={form.field("groupId").id}
              value={values.groupId}
              onValueChange={selectGroup}
              groups={lookups.groups}
              branches={lookups.branches}
              invalid={Boolean(form.field("groupId").error)}
            />
          )}
        </FormField>
        {team && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">فريق التدريس (من تعيينات المجموعة)</p>
            {team.supervisor && (
              <div className="flex items-center justify-between gap-2">
                <PersonCell name={fullName(team.supervisor)} size="sm" />
                <TeacherRoleBadge role="SUPERVISOR" />
              </div>
            )}
            {team.assistants.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <PersonCell name={fullName(t)} size="sm" />
                <TeacherRoleBadge role="ASSISTANT" />
              </div>
            ))}
          </div>
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
      </FormSection>

      <FormSection title="المكان">
        <FormField label="الفرع" required {...form.field("branchId")}>
          <Select
            value={values.branchId}
            onValueChange={(b) => {
              // Radix also reports programmatic value changes — only a real switch resets the room
              if (b === values.branchId) return
              setField("branchId", b)
              setField("roomId", "")
            }}
          >
            <SelectTrigger id={form.field("branchId").id} className="w-full">
              <SelectValue placeholder="اختر الفرع" />
            </SelectTrigger>
            <SelectContent position="popper">
              {lookups.branches
                .filter((b) => b.status === "ACTIVE" || b.id === values.branchId)
                .map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label="القاعة"
          required
          description={values.branchId ? undefined : "اختر الفرع أولًا"}
          {...form.field("roomId")}
        >
          <Select
            value={values.roomId}
            onValueChange={(r) => {
              setField("roomId", r)
              form.touch("roomId")
            }}
            disabled={!values.branchId}
          >
            <SelectTrigger
              id={form.field("roomId").id}
              className="w-full"
              aria-invalid={form.field("roomId").error ? true : undefined}
            >
              <SelectValue placeholder="اختر القاعة" />
            </SelectTrigger>
            <SelectContent position="popper">
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <div className="sm:col-span-2">
          {conflicts.length > 0 ? (
            <ConflictAlert
              conflicts={conflicts}
              lookups={lookups}
              freeRooms={alternatives}
              onPickRoom={(roomId) => setField("roomId", roomId)}
            />
          ) : (
            complete && (
              <p className="flex items-center gap-1.5 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-soft-foreground">
                <CheckCircle2 className="size-4" aria-hidden />
                {branchesById.get(values.branchId)?.name}: القاعة والمعلمون متاحون في هذا الوقت.
              </p>
            )
          )}
        </div>
      </FormSection>
    </FormSheet>
  )
}
