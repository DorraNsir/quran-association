"use client"

import { Info } from "lucide-react"

import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { MultiSelect } from "@/components/shared/multi-select"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFormState } from "@/hooks/use-form-state"
import { fullName, indexById, type Lookups } from "@/lib/domain"
import { countLabels } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { MOCK_TODAY, newMockId } from "@/lib/mock/reference-date"
import { requiredText } from "@/lib/validation"
import type { Group, GroupStatus, ID, ScheduleSlot, Student } from "@/types/domain"

import { ScheduleEditor, scheduleSlotError } from "./schedule-editor"

interface GroupFormValues {
  name: string
  audience: string
  branchId: string
  roomId: string
  supervisorId: string
  assistantIds: string[]
  studentIds: string[]
  schedule: ScheduleSlot[]
  status: GroupStatus
}

export interface GroupSaveResult {
  group: Group
  studentIds: ID[]
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

export function GroupFormSheet({
  open,
  onOpenChange,
  group,
  lookups,
  students,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: Group
  lookups: Lookups
  students: Student[]
  onSave: (result: GroupSaveResult) => void
}) {
  const currentMembers = group ? students.filter((s) => s.groupId === group.id).map((s) => s.id) : []
  const otherNames = lookups.groups.filter((g) => g.id !== group?.id).map((g) => g.name.trim())

  const form = useFormState<GroupFormValues>(
    `group-${group?.id ?? "new"}`,
    {
      name: group?.name ?? "",
      audience: group?.audience ?? "",
      branchId: group?.branchId ?? "",
      roomId: group?.roomId ?? "",
      supervisorId: group?.supervisorId ?? "",
      assistantIds: group?.assistantIds ?? [],
      studentIds: currentMembers,
      schedule: group?.schedule ?? [],
      status: group?.status ?? "ACTIVE",
    },
    (v) => ({
      name: requiredText(v.name, "اسم المجموعة مطلوب") ??
        (otherNames.includes(v.name.trim()) ? "توجد مجموعة بهذا الاسم" : undefined),
      branchId: v.branchId ? undefined : "اختر الفرع",
      roomId: v.roomId ? undefined : "اختر القاعة",
      supervisorId: v.supervisorId ? undefined : "لكل مجموعة معلم مشرف واحد",
      schedule: v.schedule.some((slot, i) => scheduleSlotError(slot, v.schedule, i))
        ? "راجع مواعيد الحصص"
        : undefined,
    })
  )
  const { values, setField } = form

  const groupsById = indexById(lookups.groups)
  const branch = lookups.branches.find((b) => b.id === values.branchId)
  const activeTeachers = lookups.teachers.filter(
    (t) => t.status === "ACTIVE" || t.id === values.supervisorId || values.assistantIds.includes(t.id)
  )
  const moving = values.studentIds.filter((id) => !currentMembers.includes(id)).length

  const submit = form.handleSubmit((v) =>
    onSave({
      group: {
        id: group?.id ?? newMockId("g"),
        createdAt: group?.createdAt ?? MOCK_TODAY,
        name: v.name.trim(),
        audience: v.audience.trim(),
        branchId: v.branchId,
        roomId: v.roomId,
        supervisorId: v.supervisorId,
        assistantIds: v.assistantIds.filter((id) => id !== v.supervisorId),
        schedule: v.schedule,
        status: v.status,
      },
      studentIds: v.studentIds,
    })
  )

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={group ? `تعديل ${group.name}` : "إنشاء مجموعة جديدة"}
      description="الحقول المعلَّمة بـ * إلزامية."
      onSubmit={submit}
      submitLabel={group ? "حفظ التعديلات" : "إنشاء المجموعة"}
    >
      <FormSection title="المعلومات العامة">
        <FormField label="اسم المجموعة" required {...form.field("name")}>
          <Input placeholder="مثال: مجموعة الفرقان" {...form.inputProps("name")} />
        </FormField>
        <FormField label="الفئة المستهدفة" optional {...form.field("audience")}>
          <Input placeholder="مثال: أطفال 7–10 سنوات" {...form.inputProps("audience")} />
        </FormField>
        <FormField label="الحالة" required {...form.field("status")}>
          <SimpleSelect
            id={form.field("status").id}
            value={values.status}
            onValueChange={(v) => setField("status", v as GroupStatus)}
            placeholder=""
            options={(["ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((s) => ({
              value: s,
              label: labels.status[s],
            }))}
          />
        </FormField>
      </FormSection>

      <FormSection title="المكان">
        <FormField label="الفرع" required {...form.field("branchId")}>
          <SimpleSelect
            id={form.field("branchId").id}
            value={values.branchId}
            onValueChange={(v) => {
              setField("branchId", v)
              setField("roomId", "")
              form.touch("branchId")
            }}
            placeholder="اختر الفرع"
            invalid={Boolean(form.field("branchId").error)}
            options={lookups.branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </FormField>
        <FormField
          label="القاعة"
          required
          description={branch ? undefined : "اختر الفرع أولًا"}
          {...form.field("roomId")}
        >
          <SimpleSelect
            id={form.field("roomId").id}
            value={values.roomId}
            onValueChange={(v) => {
              setField("roomId", v)
              form.touch("roomId")
            }}
            placeholder="اختر القاعة"
            disabled={!branch}
            invalid={Boolean(form.field("roomId").error)}
            options={(branch?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))}
          />
        </FormField>
      </FormSection>

      <FormSection
        title="فريق التدريس"
        description="معلم مشرف واحد مسؤول عن المجموعة، ويمكن إضافة معلم مساعد أو أكثر."
      >
        <FormField label={labels.teachingRole.SUPERVISOR} required {...form.field("supervisorId")}>
          <SimpleSelect
            id={form.field("supervisorId").id}
            value={values.supervisorId}
            onValueChange={(v) => {
              setField("supervisorId", v)
              setField("assistantIds", values.assistantIds.filter((id) => id !== v))
              form.touch("supervisorId")
            }}
            placeholder="اختر المعلم المشرف"
            invalid={Boolean(form.field("supervisorId").error)}
            options={activeTeachers.map((t) => ({ value: t.id, label: fullName(t) }))}
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
            options={activeTeachers
              .filter((t) => t.id !== values.supervisorId)
              .map((t) => ({ value: t.id, label: fullName(t), description: t.qualification }))}
          />
        </FormField>
      </FormSection>

      <FormSection title="الطلبة" description="كل طالب ينتمي إلى مجموعة نشطة واحدة.">
        <FormField label="طلبة المجموعة" optional className="sm:col-span-2" {...form.field("studentIds")}>
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
                return {
                  value: s.id,
                  label: fullName(s),
                  section: isMember ? "أعضاء المجموعة حاليًا" : "طلبة في مجموعات أخرى",
                  description: isMember ? undefined : `حاليًا في ${groupsById.get(s.groupId)?.name ?? "—"}`,
                  locked: isMember,
                }
              })}
          />
        </FormField>
        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>
            {moving > 0 && (
              <strong className="font-medium text-foreground">
                سيُنقل {countLabels.students(moving)} من مجموعاتهم الحالية.{" "}
              </strong>
            )}
            لإخراج طالب من هذه المجموعة استعمل «تغيير المجموعة» من صفحة الطلبة، حتى لا يبقى بدون مجموعة.
          </p>
        </div>
      </FormSection>

      <FormSection
        title="المواعيد الأسبوعية"
        description="سيُضاف التحقق من تعارض القاعات والمعلمين مع وحدة الرزنامة."
      >
        <ScheduleEditor
          id={form.field("schedule").id}
          value={values.schedule}
          onChange={(slots) => setField("schedule", slots)}
          showErrors={form.submitted}
        />
      </FormSection>
    </FormSheet>
  )
}
