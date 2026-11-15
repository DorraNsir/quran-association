"use client"

import { CalendarPlus, CalendarRange, Info } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { ClassPicker } from "@/components/groups/class-picker"
import { TeacherRoleBadge } from "@/components/shared/badges"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFormState } from "@/hooks/use-form-state"
import { keys, useApiMutation } from "@/lib/api/academic"
import { api } from "@/lib/api/client"
import { ApiError } from "@/lib/api/errors"
import { useCreateExtraSession, useUpdateSession, type SessionDto } from "@/lib/api/sessions"
import { addDays, todayInTunis } from "@/lib/dates"
import { describeClass, fullName, indexLookups, roomsOfBranch, type Lookups } from "@/lib/domain"
import { formatDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { isValidTimeRange } from "@/lib/scheduling"
import { notStartedInTunis } from "@/lib/session-actions"
import type { ID, ISODate, Student, WeeklySlotSave } from "@/types/domain"

import { ScheduleFormSheet } from "./schedule-form-sheet"
import { SharedClassesField } from "./shared-classes-field"

/**
 * Saves a weekly slot (create or edit) through the API — which re-checks
 * conflicts and, on creation, generates the slot's sessions until the end of
 * the current academic year — then confirms it. Shared by the calendar and
 * the sessions page so «برمجة موعد أسبوعي» behaves the same everywhere.
 */
export function useSaveWeeklySlot(lookups: Lookups) {
  const indexes = indexLookups(lookups)
  const mutation = useApiMutation(
    (saved: WeeklySlotSave) => {
      const body = {
        dayOfWeek: saved.day,
        startTime: saved.start,
        endTime: saved.end,
        roomId: saved.roomId,
        // «حصة مشتركة»: the other classes of the lesson (full list; [] = back to a
        // normal slot) — omitted for a normal slot, so its request is unchanged
        ...(saved.additionalGroupClassIds ? { additionalGroupClassIds: saved.additionalGroupClassIds } : {}),
        // «تاريخ بداية الحصص»: always at creation; when editing, only a change
        // (the form leaves it out otherwise, so other edits never touch it)
        ...(saved.startDate ? { startDate: saved.startDate } : {}),
        // A later start date: exactly the unused lessons the administrator confirmed
        ...(saved.removeSessionIds ? { removeSessionIds: saved.removeSessionIds } : {}),
      }
      return saved.id
        ? api<WeeklySlotWrite>(`/admin/group-classes/${saved.groupClassId}/schedules/${saved.id}`, { method: "PATCH", body })
        : api<WeeklySlotWrite>(`/admin/group-classes/${saved.groupClassId}/schedules`, { method: "POST", body })
    },
    [keys.schedules, keys.sessions, keys.rooms]
  )
  return async (saved: WeeklySlotSave) => {
    const exists = Boolean(saved.id)
    const result = await mutation.mutateAsync(saved)
    const names = [saved.groupClassId, ...(saved.additionalGroupClassIds ?? [])]
      .map((id) => indexes.groupsById.get(indexes.classesById.get(id)?.groupId ?? "")?.name)
      .filter(Boolean)
      .join(" + ")
    toast.success(
      `${exists ? "تم تعديل الموعد الأسبوعي" : "تمت برمجة موعد أسبوعي"} ${names} — ${labels.weekday[saved.day]} ${formatTimeRange(saved.start, saved.end)}`
    )
    // Dates the automatic planning could not fill (a class, room or teacher was already taken)
    const skipped = result?.generation?.skippedConflicts ?? []
    if (skipped.length > 0)
      toast.warning(`لم تُبرمج ${skipped.length === 1 ? "حصة واحدة" : `${skipped.length} حصص`} من هذا الموعد بسبب تعارض`, {
        description: skipped
          .slice(0, 5)
          .map((s) => `${formatDate(s.date)}: ${SKIP_REASON[s.reason]}`)
          .join("، "),
      })
  }
}

/** What a weekly slot write returns: the dates its automatic planning skipped, and why. */
interface WeeklySlotWrite {
  generation: {
    skippedConflicts: { date: ISODate; reason: "CLASS" | "ROOM" | "TEACHER" }[]
  } | null
}

const SKIP_REASON = {
  CLASS: "أحد الأقسام لديه حصة أخرى",
  ROOM: "القاعة مشغولة",
  TEACHER: "أحد المعلمين مشغول",
} as const

type ButtonVariant = "default" | "outline"

/** «برمجة موعد أسبوعي»: a slot repeated every week (its sessions are created automatically). */
export function WeeklySlotButton({
  lookups,
  students,
  variant = "default",
}: {
  lookups: Lookups
  students?: Student[]
  variant?: ButtonVariant
}) {
  const [state, setState] = useState<{ key: number; open: boolean } | null>(null)
  const save = useSaveWeeklySlot(lookups)
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setState((s) => ({ key: (s?.key ?? 0) + 1, open: true }))}>
        <CalendarRange />
        برمجة موعد أسبوعي
      </Button>
      {state && (
        <ScheduleFormSheet
          key={state.key}
          open={state.open}
          onOpenChange={(open) => !open && setState((s) => (s ? { ...s, open: false } : s))}
          lookups={lookups}
          students={students}
          onSave={async (slot) => {
            await save(slot)
            setState((s) => (s ? { ...s, open: false } : s))
          }}
        />
      )}
    </>
  )
}

/** Values pre-filled from the calendar (class / room filters, the shown day). */
export type ExtraSessionPreset = Partial<Pick<Values, "groupClassId" | "roomId" | "date">>

/** Who adds the lesson: the administration, or a supervisor teacher (their own classes only). */
export type ExtraSessionScope = { scope?: "admin" } | { scope: "teacher"; supervisorId: ID }

/** «حصة إضافية (مرة واحدة)»: one lesson on one date, not repeated. */
export function ExtraSessionButton({
  lookups,
  students,
  preset,
  variant = "outline",
  label = "حصة إضافية",
  ...who
}: {
  lookups: Lookups
  students?: Student[]
  preset?: () => ExtraSessionPreset
  variant?: ButtonVariant
  label?: string
} & ExtraSessionScope) {
  const [state, setState] = useState<{ key: number; open: boolean; preset?: ExtraSessionPreset } | null>(null)
  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => setState((s) => ({ key: (s?.key ?? 0) + 1, open: true, preset: preset?.() }))}
      >
        <CalendarPlus />
        {label}
      </Button>
      {state && (
        <ExtraSessionSheet
          key={state.key}
          open={state.open}
          onOpenChange={(open) => !open && setState((s) => (s ? { ...s, open: false } : s))}
          lookups={lookups}
          students={students}
          preset={state.preset}
          {...who}
        />
      )}
    </>
  )
}

interface Values {
  groupClassId: string
  /** «حصة مشتركة»: other classes taught in the same lesson */
  additionalGroupClassIds: string[]
  date: ISODate
  start: string
  end: string
  roomId: string
}

const DEFAULT_START = "09:00"

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))

/**
 * One extra lesson of a class (a make-up, an exam day…): not started yet, in
 * a room of the class's branch, with the class's current team. It is not
 * tied to a weekly slot, so moving or deleting a slot never touches it. The
 * API re-checks everything (time already past, room / teacher conflicts,
 * the supervisor for a teacher).
 *
 * - admin: any class; with `session`, «تعديل الحصة» of that extra lesson
 *   (host class locked; a stale form is refused, never overwritten);
 * - teacher: only the active classes they SUPERVISE (their own endpoint).
 */
export function ExtraSessionSheet({
  open,
  onOpenChange,
  lookups,
  students,
  preset,
  session,
  ...who
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lookups: Lookups
  students?: Student[]
  preset?: ExtraSessionPreset
  /** Edit this extra lesson (admin only) */
  session?: SessionDto
} & ExtraSessionScope) {
  const today = todayInTunis()
  const queryClient = useQueryClient()
  const editing = who.scope !== "teacher" && session ? session : undefined
  // A teacher adds lessons only to the active classes they supervise
  const scoped: Lookups =
    who.scope === "teacher"
      ? { ...lookups, groupClasses: lookups.groupClasses.filter((c) => c.supervisorId === who.supervisorId && c.status === "ACTIVE") }
      : lookups
  const indexes = indexLookups(scoped)
  const create = useCreateExtraSession(who.scope ?? "admin")
  const update = useUpdateSession(editing?.id ?? "")
  // The class's usual room is pre-selected: the first ACTIVE room of its branch
  // among the rooms it meets in (its own weekly slots first, then shared ones)
  const usualRoom = (groupClassId: string) => {
    const branchId = indexes.classesById.get(groupClassId)?.branchId
    return indexes.roomsByClass.get(groupClassId)?.find((r) => r.branchId === branchId && r.status === "ACTIVE")?.id ?? ""
  }
  const onlyClass = !editing && scoped.groupClasses.length === 1 ? scoped.groupClasses[0].id : ""
  const initialClass = editing?.groupClass.id ?? preset?.groupClassId ?? onlyClass
  const initialExtras = (editing?.additionalClasses ?? []).map((c) => c.id)
  // A new lesson starts at 09:00 on the shown day, or tomorrow once 09:00 today has passed
  const presetDate = preset?.date && preset.date >= today ? preset.date : today
  const initialDate = notStartedInTunis(presetDate, DEFAULT_START) ? presetDate : addDays(today, 1)
  const form = useFormState<Values>(
    editing ? "edit-extra-session" : "extra-session",
    editing
      ? {
          groupClassId: initialClass,
          additionalGroupClassIds: initialExtras,
          date: editing.date,
          start: editing.startTime,
          end: editing.endTime,
          roomId: editing.room.id,
        }
      : {
          groupClassId: initialClass,
          additionalGroupClassIds: [],
          date: initialDate,
          start: DEFAULT_START,
          end: "10:30",
          roomId: preset?.roomId ?? usualRoom(initialClass),
        },
    (v) => ({
      groupClassId: v.groupClassId ? undefined : "اختر المجموعة ثم القسم",
      date: !v.date
        ? "اختر التاريخ"
        : v.date < today
          ? "لا يمكن برمجة حصة إضافية في تاريخ سابق"
          : undefined,
      start: v.date && v.date >= today && !notStartedInTunis(v.date, v.start) ? "هذا الوقت قد مضى: اختر موعدًا لم يحن بعد" : undefined,
      roomId: v.roomId ? undefined : "اختر قاعة هذه الحصة",
      end: isValidTimeRange(v.start, v.end) ? undefined : "يجب أن تكون ساعة النهاية بعد ساعة البداية",
    })
  )
  const { values, setField } = form
  const groupClass = indexes.classesById.get(values.groupClassId)
  const view = groupClass ? describeClass(groupClass, indexes) : undefined
  const branchRooms = groupClass ? roomsOfBranch(groupClass.branchId, scoped.rooms).filter((r) => r.status === "ACTIVE") : []
  const hostName = editing ? (indexes.groupsById.get(groupClass?.groupId ?? "")?.name ?? editing.groupClass.group.name) : undefined

  const submit = form.handleSubmit(async (v) => {
    const names = [v.groupClassId, ...v.additionalGroupClassIds]
      .map((id) => indexes.groupsById.get(indexes.classesById.get(id)?.groupId ?? "")?.name)
      .filter(Boolean)
      .join(" + ")
    if (editing) {
      try {
        await update.mutateAsync({
          date: v.date,
          startTime: v.start,
          endTime: v.end,
          roomId: v.roomId,
          // Only a change of the shared classes is sent (an unchanged list is left alone)
          ...(sameIds(v.additionalGroupClassIds, initialExtras) ? {} : { additionalGroupClassIds: v.additionalGroupClassIds }),
          ...(editing.updatedAt ? { expectedUpdatedAt: editing.updatedAt } : {}),
        })
      } catch (error) {
        // Changed by someone else meanwhile: show its current state (the message explains)
        if (error instanceof ApiError && error.code === "SESSION_CHANGED")
          await queryClient.invalidateQueries({ queryKey: keys.sessions })
        throw error
      }
      toast.success(`تم تعديل الحصة الإضافية ${names} — ${formatDate(v.date)} ${formatTimeRange(v.start, v.end)}`)
    } else {
      await create.mutateAsync({
        groupClassId: v.groupClassId,
        ...(v.additionalGroupClassIds.length ? { additionalGroupClassIds: v.additionalGroupClassIds } : {}),
        roomId: v.roomId,
        date: v.date,
        startTime: v.start,
        endTime: v.end,
      })
      toast.success(`تمت برمجة حصة إضافية ${names} — ${formatDate(v.date)} ${formatTimeRange(v.start, v.end)}`)
    }
    onOpenChange(false)
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "تعديل الحصة الإضافية" : "حصة إضافية (مرة واحدة)"}
      description={
        editing
          ? "غيّر تاريخ الحصة أو توقيتها أو قاعتها أو الأقسام المشاركة فيها؛ يبقى القسم نفسه، ويُعلَم معلموه وطلبته بالتغيير."
          : "حصة واحدة في تاريخ محدد (تعويض، مراجعة…) لا تتكرر كل أسبوع، مع معلمي القسم."
      }
      onSubmit={submit}
      submitLabel={editing ? "حفظ التعديل" : "برمجة الحصة الإضافية"}
      pending={form.pending}
      error={form.serverError}
    >
      <FormSection title="القسم">
        {editing ? (
          <FormField label="المجموعة والقسم" className="sm:col-span-2" description="لا يمكن تغيير قسم الحصة" id="edit-extra-session-class">
            <p id="edit-extra-session-class" className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
              {hostName}
              {view?.branch ? ` — ${view.branch.name}` : ""}
            </p>
          </FormField>
        ) : (
          <FormField label="المجموعة والقسم" required className="sm:col-span-2" {...form.field("groupClassId")}>
            <ClassPicker
              id={form.field("groupClassId").id}
              value={values.groupClassId}
              onChange={(id) => {
                setField("groupClassId", id)
                setField("additionalGroupClassIds", [])
                setField("roomId", usualRoom(id))
                form.touch("groupClassId")
              }}
              lookups={scoped}
              students={students}
              invalid={Boolean(form.field("groupClassId").error)}
            />
          </FormField>
        )}
        {who.scope === "teacher" && scoped.groupClasses.length === 0 && (
          <p className="text-sm text-muted-foreground sm:col-span-2">لا يوجد قسم نشط تشرف عليه.</p>
        )}
        {view && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
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
        <SharedClassesField
          id="extra-shared"
          host={groupClass}
          value={values.additionalGroupClassIds}
          onChange={(ids) => setField("additionalGroupClassIds", ids)}
          lookups={scoped}
          students={students}
        />
      </FormSection>

      <FormSection title="الموعد">
        <FormField label="التاريخ" required className="sm:col-span-2" description="اليوم أو بعده، في وقت لم يحن بعد" {...form.field("date")}>
          <Input type="date" dir="ltr" min={today} {...form.inputProps("date")} />
        </FormField>
        <FormField label="من" required {...form.field("start")}>
          <Input type="time" dir="ltr" step={900} {...form.inputProps("start")} />
        </FormField>
        <FormField label="إلى" required {...form.field("end")}>
          <Input type="time" dir="ltr" step={900} {...form.inputProps("end")} />
        </FormField>
        <FormField
          label="القاعة"
          required
          className="sm:col-span-2"
          description={groupClass ? undefined : "اختر القسم أولًا"}
          {...form.field("roomId")}
        >
          <Select
            value={values.roomId}
            onValueChange={(id) => {
              setField("roomId", id)
              form.touch("roomId")
            }}
            disabled={!groupClass}
          >
            <SelectTrigger id={form.field("roomId").id} className="w-full" aria-invalid={Boolean(form.field("roomId").error) || undefined}>
              <SelectValue placeholder="اختر القاعة" />
            </SelectTrigger>
            <SelectContent position="popper">
              {branchRooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          لا تتكرر هذه الحصة ولا تتأثر بتعديل المواعيد الأسبوعية أو حذفها. يُرفض الحفظ إذا كانت القاعة أو أحد المعلمين مشغولًا في هذا الوقت.
        </p>
      </FormSection>
    </FormSheet>
  )
}
