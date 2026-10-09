"use client"

import { Info } from "lucide-react"

import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { MultiSelect } from "@/components/shared/multi-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFormState } from "@/hooks/use-form-state"
import { fullName, indexLookups, roomsOfBranch, schedulesOf, studentClass, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { ClassSaveInput } from "@/lib/api/hooks/groups"
import { checkClassSlots, type SlotDraft } from "@/lib/scheduling"
import type { Group, GroupClass, GroupClassStatus, Student } from "@/types/domain"

import { draftError, ScheduleEditor } from "./schedule-editor"

interface ClassFormValues {
  branchId: string
  roomId: string
  supervisorId: string
  assistantIds: string[]
  studentIds: string[]
  slots: SlotDraft[]
  status: GroupClassStatus
}


/** Id used for conflict checks while a new class has no id yet. */
const DRAFT_CLASS_ID = "draft-class"

function toDraftClass(v: ClassFormValues, group: Group, groupClass?: GroupClass): GroupClass {
  return {
    id: groupClass?.id ?? DRAFT_CLASS_ID,
    groupId: group.id,
    branchId: v.branchId,
    roomId: v.roomId,
    supervisorId: v.supervisorId,
    assistantIds: v.assistantIds.filter((id) => id !== v.supervisorId),
    status: v.status,
  }
}

function SimpleSelect({
  id,
  value,
  onValueChange,
  placeholder,
  options,
  invalid,
  disabled,
}: {
  id: string
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  options: { value: string; label: string }[]
  invalid?: boolean
  disabled?: boolean
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * One actual class of a group: where it meets, who teaches it, who studies
 * in it and when. Several classes of the same group can coexist.
 */
export function ClassFormSheet({
  open,
  onOpenChange,
  group,
  groupClass,
  lookups,
  students,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  groupClass?: GroupClass
  lookups: Lookups
  students: Student[]
  /** Saves through the API (class, slots, transfers); a rejection is shown in the form */
  onSave: (input: ClassSaveInput) => Promise<void>
}) {
  const indexes = indexLookups(lookups)
  const currentMembers = groupClass ? students.filter((s) => s.groupClassId === groupClass.id).map((s) => s.id) : []
  const slotChecks = (v: ClassFormValues) =>
    checkClassSlots(v.slots, toDraftClass(v, group, groupClass), lookups)

  const form = useFormState<ClassFormValues>(
    `class-${groupClass?.id ?? "new"}`,
    {
      branchId: groupClass?.branchId ?? "",
      roomId: groupClass?.roomId ?? "",
      supervisorId: groupClass?.supervisorId ?? "",
      assistantIds: groupClass?.assistantIds ?? [],
      studentIds: currentMembers,
      slots: groupClass
        ? schedulesOf(groupClass.id, lookups.schedules).map((s) => ({ key: `saved:${s.id}`, id: s.id, day: s.day, start: s.start, end: s.end }))
        : [],
      status: groupClass?.status ?? "ACTIVE",
    },
    (v) => ({
      branchId: v.branchId ? undefined : "اختر الفرع",
      roomId: v.roomId ? undefined : "اختر القاعة",
      supervisorId: v.supervisorId ? undefined : "لكل حلقة مدرس مشرف واحد",
      slots:
        v.slots.some((row) => draftError(row)) || [...slotChecks(v).values()].some((c) => c.conflicts.length > 0)
          ? "راجع مواعيد الحصص: توجد أوقات غير صحيحة أو تعارضات"
          : undefined,
    })
  )
  const { values, setField } = form

  const branchRooms = roomsOfBranch(values.branchId, lookups.rooms).filter(
    (r) => r.status === "ACTIVE" || r.id === values.roomId
  )
  const teachers = lookups.teachers.filter(
    (t) => t.status === "ACTIVE" || t.id === values.supervisorId || values.assistantIds.includes(t.id)
  )
  const moving = values.studentIds.filter((id) => !currentMembers.includes(id)).length
  const isRunning = values.status === "ACTIVE" && group.status === "ACTIVE"

  const submit = form.handleSubmit((v) => {
    const { id: _draft, ...draft } = toDraftClass(v, group, groupClass)
    void _draft
    return onSave({
      groupClass: { ...draft, id: groupClass?.id },
      studentIds: v.studentIds,
      currentMemberIds: currentMembers,
      slots: v.slots.map(({ id, day, start, end }) => ({ id, day, start, end })),
      previousSlots: groupClass ? schedulesOf(groupClass.id, lookups.schedules) : [],
    })
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={groupClass ? `تعديل حلقة ${indexes.branchesById.get(groupClass.branchId)?.name ?? ""}` : `حلقة جديدة — ${group.name}`}
      description={`${group.name}: لكل حلقة فرعها وقاعتها ومدرسها المشرف وطلبتها ومواعيدها.`}
      onSubmit={submit}
      submitLabel={groupClass ? "حفظ التعديلات" : "إنشاء الحلقة"}
      pending={form.pending}
      error={form.serverError}
    >
      <FormSection title="المكان">
        <FormField label="الفرع" required {...form.field("branchId")}>
          <SimpleSelect
            id={form.field("branchId").id}
            value={values.branchId}
            onValueChange={(v) => {
              // Radix also reports programmatic changes — only a real switch resets the room
              if (v === values.branchId) return
              setField("branchId", v)
              setField("roomId", "")
              form.touch("branchId")
            }}
            placeholder="اختر الفرع"
            invalid={Boolean(form.field("branchId").error)}
            options={lookups.branches
              .filter((b) => b.status === "ACTIVE" || b.id === values.branchId)
              .map((b) => ({ value: b.id, label: b.name }))}
          />
        </FormField>
        <FormField label="القاعة" required description={values.branchId ? "كل حصص الحلقة في هذه القاعة." : "اختر الفرع أولًا"} {...form.field("roomId")}>
          <SimpleSelect
            id={form.field("roomId").id}
            value={values.roomId}
            onValueChange={(v) => {
              setField("roomId", v)
              form.touch("roomId")
            }}
            placeholder="اختر القاعة"
            disabled={!values.branchId}
            invalid={Boolean(form.field("roomId").error)}
            options={branchRooms.map((r) => ({ value: r.id, label: r.name }))}
          />
        </FormField>
        <FormField label="الحالة" required {...form.field("status")}>
          <SimpleSelect
            id={form.field("status").id}
            value={values.status}
            onValueChange={(v) => setField("status", v as GroupClassStatus)}
            placeholder=""
            options={(["ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((s) => ({ value: s, label: labels.status[s] }))}
          />
        </FormField>
      </FormSection>

      <FormSection title="فريق التدريس" description="مدرس مشرف واحد لهذه الحلقة، ومعلم مساعد أو أكثر إن وُجد.">
        <FormField label="المدرس المشرف" required {...form.field("supervisorId")}>
          <SimpleSelect
            id={form.field("supervisorId").id}
            value={values.supervisorId}
            onValueChange={(v) => {
              setField("supervisorId", v)
              setField("assistantIds", values.assistantIds.filter((id) => id !== v))
              form.touch("supervisorId")
            }}
            placeholder="اختر المدرس المشرف"
            invalid={Boolean(form.field("supervisorId").error)}
            options={teachers.map((t) => ({ value: t.id, label: fullName(t) }))}
          />
        </FormField>
        <FormField label="المعلمون المساعدون" optional {...form.field("assistantIds")}>
          <MultiSelect
            id={form.field("assistantIds").id}
            placeholder="بدون معلم مساعد"
            searchPlaceholder="ابحث عن معلم…"
            countLabel={countLabels.teachers}
            selected={values.assistantIds}
            onChange={(ids) => setField("assistantIds", ids)}
            options={teachers
              .filter((t) => t.id !== values.supervisorId)
              .map((t) => ({ value: t.id, label: fullName(t), description: t.qualification }))}
          />
        </FormField>
      </FormSection>

      <FormSection title="الطلبة" description="يدرس كل طالب في حلقة واحدة.">
        <FormField label="طلبة الحلقة" optional className="sm:col-span-2" {...form.field("studentIds")}>
          <MultiSelect
            id={form.field("studentIds").id}
            placeholder="لم يُضَف أي طالب"
            searchPlaceholder="ابحث باسم الطالب…"
            countLabel={countLabels.students}
            selected={values.studentIds}
            onChange={(ids) => setField("studentIds", ids)}
            options={students
              .filter((s) => s.status !== "ARCHIVED")
              .map((s) => {
                const isMember = currentMembers.includes(s.id)
                const current = studentClass(s, indexes)
                return {
                  value: s.id,
                  label: fullName(s),
                  section: isMember ? "طلبة الحلقة حاليًا" : "طلبة في حلقات أخرى",
                  description: isMember ? undefined : `حاليًا في ${current?.group?.name ?? "—"} · ${current?.branch?.name ?? ""}`,
                  locked: isMember,
                }
              })}
          />
        </FormField>
        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>
            {moving > 0 && (
              <strong className="font-medium text-foreground">سيُنقل {countLabels.students(moving)} من حلقاتهم الحالية. </strong>
            )}
            لإخراج طالب من هذه الحلقة استعمل «تغيير المجموعة أو الحلقة» من صفحة الطلبة، حتى لا يبقى بدون حلقة.
          </p>
        </div>
      </FormSection>

      <FormSection
        title="المواعيد الأسبوعية"
        description={
          isRunning
            ? "يُتحقَّق مباشرة من توفّر قاعة الحلقة ومن عدم ارتباط معلميها بحلقة أخرى في نفس الوقت."
            : "الحلقة أو المجموعة غير نشطة: لا تحجز حصصها القاعات ولا المعلمين، لذلك لا يُتحقَّق من التعارضات."
        }
      >
        {form.field("slots").error && (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">
            {form.field("slots").error}
          </p>
        )}
        <ScheduleEditor
          id={form.field("slots").id}
          rows={values.slots}
          onChange={(rows) => setField("slots", rows)}
          lookups={lookups}
          checks={slotChecks(values)}
          onPickRoom={(roomId) => setField("roomId", roomId)}
          showErrors={form.submitted}
        />
      </FormSection>
    </FormSheet>
  )
}
