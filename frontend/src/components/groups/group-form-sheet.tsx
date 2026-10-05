"use client"

import { FormField, FormSection, FormSheet } from "@/components/shared/form"
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
import { MOCK_TODAY, newMockId } from "@/lib/mock/reference-date"
import { requiredText } from "@/lib/validation"
import type { Group, GroupStatus } from "@/types/domain"

interface GroupFormValues {
  name: string
  audience: string
  status: GroupStatus
}

/**
 * The pedagogical group only: name, audience, status. Branch, room,
 * teachers, students and schedule belong to each of its classes.
 */
export function GroupFormSheet({
  open,
  onOpenChange,
  group,
  otherNames,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: Group
  /** Names of the other groups, to prevent duplicates */
  otherNames: string[]
  onSave: (group: Group) => void
}) {
  const form = useFormState<GroupFormValues>(
    `group-${group?.id ?? "new"}`,
    { name: group?.name ?? "", audience: group?.audience ?? "", status: group?.status ?? "ACTIVE" },
    (v) => ({
      name:
        requiredText(v.name, "اسم المجموعة مطلوب") ??
        (otherNames.includes(v.name.trim()) ? "توجد مجموعة بهذا الاسم" : undefined),
    })
  )

  const submit = form.handleSubmit((v) =>
    onSave({
      id: group?.id ?? newMockId("g"),
      createdAt: group?.createdAt ?? MOCK_TODAY,
      name: v.name.trim(),
      audience: v.audience.trim(),
      status: v.status,
    })
  )

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={group ? `تعديل ${group.name}` : "إنشاء مجموعة جديدة"}
      description={
        group
          ? "الفرع والمدرس المشرف والطلبة والمواعيد تُعدَّل من كل حلقة في صفحة المجموعة."
          : "بعد الإنشاء، أضف حلقات المجموعة (فرع، مدرس مشرف، طلبة، مواعيد) من صفحتها."
      }
      onSubmit={submit}
      submitLabel={group ? "حفظ التعديلات" : "إنشاء المجموعة"}
    >
      <FormSection title="المعلومات العامة">
        <FormField label="اسم المجموعة" required {...form.field("name")}>
          <Input placeholder="مثال: مجموعة ماهر" {...form.inputProps("name")} />
        </FormField>
        <FormField label="الفئة المستهدفة" optional {...form.field("audience")}>
          <Input placeholder="مثال: أطفال 7–10 سنوات" {...form.inputProps("audience")} />
        </FormField>
        <FormField label="الحالة" required {...form.field("status")}>
          <Select value={form.values.status} onValueChange={(v) => form.setField("status", v as GroupStatus)}>
            <SelectTrigger id={form.field("status").id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {(["ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {labels.status[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormSection>
    </FormSheet>
  )
}
