"use client"

import { BookOpen, CalendarClock, CheckCircle2, DoorOpen, Info } from "lucide-react"
import { useState } from "react"

import { ClassPicker } from "@/components/groups/class-picker"
import { ConflictAlert } from "@/components/scheduling/conflict-alert"
import { TeacherRoleBadge } from "@/components/shared/badges"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
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
import { fetchStartDateImpact, type StartDateImpactDto, type StartDateProtection } from "@/lib/api/academic"
import { ApiError } from "@/lib/api/errors"
import { addDays, eachDate, todayInTunis, weekdayOf } from "@/lib/dates"
import { describeClass, fullName, indexLookups, roomsOfBranch, type Lookups } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { labels, WEEK_ORDER } from "@/lib/i18n"
import { findConflicts, freeRooms, isValidTimeRange } from "@/lib/scheduling"
import { useCurrentAcademicYear } from "@/lib/store/settings"
import type { ISODate, Student, Weekday, WeeklySchedule, WeeklySlotSave } from "@/types/domain"

import { SharedClassesField } from "./shared-classes-field"

type ScheduleValues = Omit<WeeklySchedule, "id">

/**
 * The past dates (before today, up to `until`) a slot starting on `start`
 * gets lessons on: created at once, attendance pending. An estimate — dates
 * with a conflict are skipped by the API.
 */
export function pastLessonDates(day: Weekday, start: ISODate, today: ISODate, until?: ISODate) {
  const last = addDays(today, -1)
  const to = until && until < last ? until : last
  return start > to ? [] : eachDate(start, to).filter((d) => weekdayOf(d) === day)
}

/** Why a lesson before a later start date is kept */
const PROTECTION_LABELS: Record<StartDateProtection, string> = {
  COMPLETED: "منجزة",
  CANCELLED: "ملغاة",
  STUDENT_ATTENDANCE: "حضور طلبة مسجّل",
  TEACHER_ATTENDANCE: "حضور معلمين مسجّل",
  WORK: "متابعة عمل",
  ATTENDANCE_HISTORY: "سجل تعديلات الحضور",
  NOTIFICATIONS: "إشعارات الحضور",
  MODIFIED: "عُدّلت يدويًا",
}

/** The refusal of a later start date while lessons with activity exist before it. */
export function protectedLessonsMessage(date: ISODate, lessons: StartDateImpactDto["protected"]) {
  const listed = lessons
    .slice(0, 5)
    .map((l) => `${formatDate(l.date)} (${l.reasons.map((r) => PROTECTION_LABELS[r]).join("، ")})`)
    .join("؛ ")
  const more = lessons.length > 5 ? ` و${lessons.length - 5} أخرى` : ""
  return `لا يمكن تأخير تاريخ بداية الحصص إلى ${formatDate(date)}: ${
    lessons.length === 1 ? "حصة سابقة لهذا الموعد فيها نشاط" : `${lessons.length} حصص سابقة لهذا الموعد فيها نشاط`
  } ولا تُحذف — ${listed}${more}. اختر تاريخًا لا يتجاوز ${formatDate(lessons[0].date)}.`
}

/** «سيتم إنشاء 5 حصص سابقة…» */
const pastLessonsLabel = (n: number) => (n === 1 ? "حصة سابقة واحدة" : n === 2 ? "حصتان سابقتان" : `${n} حصص سابقة`)

/** Values from the clicked calendar cell (the room column pre-selects the slot's room) */
export type SchedulePreset = Partial<ScheduleValues>

/**
 * Adds or edits one weekly slot of a class. The class is chosen (group →
 * class); its branch and teachers follow, the slot's room is chosen among the
 * rooms of that branch, and everything is checked for conflicts.
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
  /** Saves through the API (it re-checks room / teacher / class conflicts); a rejection is shown in the form */
  onSave: (schedule: WeeklySlotSave) => Promise<void>
}) {
  const indexes = indexLookups(lookups)
  const today = todayInTunis()
  // «تاريخ بداية الحصص»: inside the current academic year (an ended year counts as none)
  const currentYear = useCurrentAcademicYear()
  const year = currentYear && currentYear.endDate >= today ? currentYear : undefined
  const startDateError = (date?: ISODate) => {
    if (!date) return "اختر تاريخ بداية الحصص"
    if (year && (date < year.startDate || date > year.endDate))
      return `يجب أن يكون التاريخ داخل السنة الدراسية الحالية (${formatDate(year.startDate)} – ${formatDate(year.endDate)})`
    if (!year && date < today) return "لا توجد سنة دراسية حالية: لا يمكن اختيار تاريخ سابق"
    return undefined
  }
  const legacy = schedule?.startDateSet === false
  /** Editing: the date is sent only when changed — or, for a legacy slot, the suggested one */
  const startDateSent = (date?: ISODate) => !schedule || date !== schedule.startDate || (legacy && Boolean(year))
  const form = useFormState<ScheduleValues>(
    `schedule-${schedule?.id ?? "new"}`,
    {
      groupClassId: schedule?.groupClassId ?? preset?.groupClassId ?? "",
      day: schedule?.day ?? preset?.day ?? "SAT",
      start: schedule?.start ?? preset?.start ?? "09:00",
      end: schedule?.end ?? preset?.end ?? "11:00",
      roomId: schedule?.roomId ?? preset?.roomId ?? "",
      additionalGroupClassIds: schedule?.additionalGroupClassIds ?? [],
      // A slot created before this field (no stored date): the year's start is
      // suggested — saved only with the form, never automatically
      startDate: (legacy ? year?.startDate : undefined) ?? schedule?.startDate ?? year?.startDate ?? today,
    },
    (v) => ({
      // Checked when it is sent (an unchanged date never blocks another edit)
      startDate: startDateSent(v.startDate) ? startDateError(v.startDate) : undefined,
      groupClassId: v.groupClassId ? undefined : "اختر المجموعة ثم القسم",
      roomId: v.roomId ? undefined : "اختر قاعة هذه الحصة",
      end: isValidTimeRange(v.start, v.end) ? undefined : "يجب أن تكون ساعة النهاية بعد ساعة البداية",
    })
  )
  const { values, setField } = form
  const groupClass = indexes.classesById.get(values.groupClassId)
  const view = groupClass ? describeClass(groupClass, indexes) : undefined
  const extraIds = values.additionalGroupClassIds ?? []
  const extraClasses = extraIds.flatMap((id) => indexes.classesById.get(id) ?? [])
  // The lesson's team: the common supervisor + every participating class's assistants
  const extraAssistants = extraClasses
    .flatMap((c) => describeClass(c, indexes).assistants)
    .filter((t, i, all) => all.findIndex((x) => x.id === t.id) === i && !view?.assistants.some((a) => a.id === t.id))
  // Only rooms of the class's branch (an inactive room stays listed when it is the slot's own)
  const branchRooms = groupClass
    ? roomsOfBranch(groupClass.branchId, lookups.rooms).filter((r) => r.status === "ACTIVE" || r.id === values.roomId)
    : []
  const room = indexes.roomsById.get(values.roomId)

  const context = {
    schedules: lookups.schedules,
    groupClasses: lookups.groupClasses,
    groups: lookups.groups,
    ignoreScheduleIds: schedule ? [schedule.id] : [],
  }
  const complete = groupClass && values.roomId && isValidTimeRange(values.start, values.end)
  const conflicts = complete ? findConflicts({ ...values, id: schedule?.id, groupClass, additionalClasses: extraClasses }, context) : []
  const alternatives = complete ? freeRooms(values, groupClass.branchId, lookups.rooms, context) : []

  const save = (v: ScheduleValues, removeSessionIds?: string[]) => {
    // Sent only for a shared slot, or to remove the classes of a slot that had some
    const extras = v.additionalGroupClassIds ?? []
    const send = extras.length > 0 || (schedule?.additionalGroupClassIds?.length ?? 0) > 0
    return onSave({
      ...v,
      id: schedule?.id ?? "",
      additionalGroupClassIds: send ? extras : undefined,
      startDate: startDateSent(v.startDate) ? v.startDate : undefined,
      ...(removeSessionIds ? { removeSessionIds } : {}),
    })
  }
  // A past start date creates past lessons — a new slot's, or an existing
  // slot's missing ones before its previous start: confirmed first, with their number
  const until = [schedule?.startDate && addDays(schedule.startDate, -1), year?.endDate].filter(Boolean).sort()[0]
  const past = values.startDate && startDateSent(values.startDate) ? pastLessonDates(values.day, values.startDate, today, until) : []
  const [confirmPast, setConfirmPast] = useState(false)
  // A later start date: the API lists the slot's lessons before it — unused
  // ones are removed only once confirmed (exactly these), any with activity refuse it
  const [removal, setRemoval] = useState<{ date: ISODate; lessons: StartDateImpactDto["removable"] } | null>(null)
  const later = (v: ScheduleValues) =>
    Boolean(schedule?.startDate && v.startDate && startDateSent(v.startDate) && v.startDate > schedule.startDate)
  const submit = form.handleSubmit((v) => {
    if (conflicts.length > 0) return
    if (schedule && v.startDate && later(v)) {
      const date = v.startDate
      return fetchStartDateImpact(schedule.groupClassId, schedule.id, date).then((impact) => {
        if (impact.protected.length > 0)
          throw new ApiError(409, "SCHEDULE_START_PROTECTED_SESSIONS", protectedLessonsMessage(date, impact.protected))
        if (impact.removable.length > 0) return setRemoval({ date, lessons: impact.removable })
        return save(v, [])
      })
    }
    if (past.length > 0) return setConfirmPast(true)
    return save(v)
  })

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        title={schedule ? "تعديل الموعد الأسبوعي" : "برمجة موعد أسبوعي"}
        description="يتكرر الموعد كل أسبوع في نفس اليوم والتوقيت والقاعة، مع معلمي القسم. تُنشأ حصصه تلقائيًا حتى نهاية السنة الدراسية الحالية."
        onSubmit={submit}
        submitLabel={schedule ? "حفظ التعديلات" : "برمجة الموعد"}
        submitDisabled={conflicts.length > 0}
        pending={form.pending}
        error={form.serverError}
      >
        <FormSection title="القسم">
          <FormField label="المجموعة والقسم" required className="sm:col-span-2" {...form.field("groupClassId")}>
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
                  // Shared classes depend on the class (same supervisor, same branch)
                  setField("additionalGroupClassIds", [])
                  // The room must belong to the class's branch: clear a choice that no longer fits
                  const branchId = indexes.classesById.get(id)?.branchId
                  if (room && room.branchId !== branchId) setField("roomId", "")
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
                {view.branch?.name} — من بيانات القسم
              </p>
              {view.supervisor && (
                <div className="flex items-center justify-between gap-2">
                  <PersonCell name={fullName(view.supervisor)} size="sm" />
                  <TeacherRoleBadge role="SUPERVISOR" />
                </div>
              )}
              {[...view.assistants, ...extraAssistants].map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2">
                  <PersonCell name={fullName(t)} size="sm" />
                  <TeacherRoleBadge role="ASSISTANT" />
                </div>
              ))}
            </div>
          )}
          <SharedClassesField
            id="schedule-shared"
            host={groupClass}
            value={extraIds}
            onChange={(ids) => setField("additionalGroupClassIds", ids)}
            lookups={lookups}
            students={students}
          />
          {schedule && extraIds.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              القسم الأساسي ({view?.group?.name}) ثابت: لا يمكن إزالته من الموعد. لإزالته احذف هذا الموعد ثم برمج موعدًا جديدًا. إزالة قسم إضافي لا تُنشئ له حصة بديلة.
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

          <FormField
            label="تاريخ بداية الحصص"
            required
            className="sm:col-span-2"
            description={
              !year
                ? "لا توجد سنة دراسية حالية: لا يمكن إنشاء حصص سابقة. يمكن اختيار اليوم أو تاريخ لاحق فقط."
                : schedule
                  ? "يمكنك تعديل تاريخ بداية الحصص. عند اختيار تاريخ سابق، سيتم إنشاء الحصص الناقصة تلقائيًا دون التأثير على الحصص أو سجلات الحضور الموجودة."
                  : "تبدأ الحصص تلقائيًا من تاريخ بداية السنة الدراسية الحالية. يمكنك تغيير هذا التاريخ إذا بدأت الحصص في وقت لاحق."
            }
            {...form.field("startDate")}
          >
            <Input
              id={form.field("startDate").id}
              type="date"
              min={year?.startDate ?? today}
              max={year?.endDate}
              value={values.startDate ?? ""}
              onChange={(e) => setField("startDate", e.target.value)}
              onBlur={() => form.touch("startDate")}
              aria-invalid={Boolean(form.field("startDate").error) || undefined}
            />
          </FormField>
          {legacy && year && schedule?.startDate && (
            <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
              <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              أُنشئ هذا الموعد قبل إضافة «تاريخ بداية الحصص» (حصصه تبدأ من {formatDate(schedule.startDate)}). التاريخ المقترح هو بداية السنة الدراسية، ولا يُحفظ إلا عند الضغط على «حفظ التعديلات».
            </p>
          )}

          <div className="sm:col-span-2">
            {conflicts.length > 0 ? (
              <ConflictAlert
                conflicts={conflicts}
                lookups={lookups}
                freeRooms={alternatives}
                onPickRoom={(id) => setField("roomId", id)}
                pickRoomHint="قاعات متاحة في نفس الفرع:"
              />
            ) : (
              complete && (
                <p className="flex items-center gap-1.5 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-soft-foreground">
                  <CheckCircle2 className="size-4" aria-hidden />
                  {room?.name} والمعلمون متاحون في هذا الوقت.
                </p>
              )
            )}
          </div>
        </FormSection>
      </FormSheet>
      <ConfirmDialog
        open={confirmPast}
        onOpenChange={setConfirmPast}
        title="إنشاء حصص سابقة"
        description={`سيتم إنشاء ${pastLessonsLabel(past.length)} بانتظار تسجيل الحضور (${labels.weekday[values.day]}، ابتداءً من ${
          values.startDate ? formatDate(values.startDate) : ""
        }). هل تريد المتابعة؟ العدد تقديري: قد يكون أقل إذا وُجد تعارض في بعض التواريخ، ولا تتغيّر الحصص الموجودة.`}
        confirmLabel={schedule ? "تأكيد وحفظ التعديلات" : "تأكيد وبرمجة الموعد"}
        onConfirm={() => save(values).then(() => setConfirmPast(false))}
      />
      <ConfirmDialog
        open={Boolean(removal)}
        onOpenChange={(open) => !open && setRemoval(null)}
        destructive
        title="حذف حصص سابقة"
        description={
          removal
            ? `سيؤدي تغيير تاريخ بداية الحصص إلى ${formatDate(removal.date)} إلى حذف ${
                removal.lessons.length === 1
                  ? "حصة سابقة واحدة"
                  : removal.lessons.length === 2
                    ? "حصتين سابقتين"
                    : `${removal.lessons.length} حصص سابقة`
              } لم يُسجَّل فيها أي نشاط. هل تريد المتابعة؟`
            : ""
        }
        confirmLabel="تأكيد الحذف وحفظ التعديلات"
        onConfirm={() =>
          removal
            ? save(
                values,
                removal.lessons.map((l) => l.id)
              ).then(() => setRemoval(null))
            : undefined
        }
      >
        {removal && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            الحصص التي ستُحذف: {removal.lessons.map((l) => formatDate(l.date)).join("، ")}. لا تتغيّر الحصص الأخرى ولا سجلات الحضور.
          </p>
        )}
      </ConfirmDialog>
    </>
  )
}
