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
import { newMockId } from "@/lib/mock/reference-date"
import { normalizePhone, PHONE_HINT, phoneError, requiredText } from "@/lib/validation"
import type { Branch, BranchStatus } from "@/types/domain"

interface BranchFormValues {
  name: string
  address: string
  phone: string
  status: BranchStatus
}

export function BranchFormSheet({
  open,
  onOpenChange,
  branch,
  otherNames,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  branch?: Branch
  /** Names of the other branches, to prevent duplicates */
  otherNames: string[]
  onSave: (branch: Branch) => void
}) {
  const form = useFormState<BranchFormValues>(
    `branch-${branch?.id ?? "new"}`,
    {
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
      status: branch?.status ?? "ACTIVE",
    },
    (v) => ({
      name:
        requiredText(v.name, "اسم الفرع مطلوب") ??
        (otherNames.includes(v.name.trim()) ? "يوجد فرع بهذا الاسم" : undefined),
      address: requiredText(v.address, "العنوان مطلوب"),
      phone: phoneError(v.phone, { required: false }),
    })
  )

  const submit = form.handleSubmit((v) =>
    onSave({
      id: branch?.id ?? newMockId("b"),
      name: v.name.trim(),
      address: v.address.trim(),
      phone: normalizePhone(v.phone) || undefined,
      status: v.status,
    })
  )

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={branch ? `تعديل ${branch.name}` : "إضافة فرع جديد"}
      description="القاعات تُضاف من صفحة الفرع بعد إنشائه."
      onSubmit={submit}
      submitLabel={branch ? "حفظ التعديلات" : "إضافة الفرع"}
    >
      <FormSection title="معلومات الفرع">
        <FormField label="اسم الفرع" required className="sm:col-span-2" {...form.field("name")}>
          <Input placeholder="مثال: فرع حي الرياض" {...form.inputProps("name")} />
        </FormField>
        <FormField label="العنوان" required className="sm:col-span-2" {...form.field("address")}>
          <Input {...form.inputProps("address")} autoComplete="street-address" />
        </FormField>
        <FormField label="الهاتف" optional description={PHONE_HINT} {...form.field("phone")}>
          <Input type="tel" dir="ltr" inputMode="tel" {...form.inputProps("phone")} />
        </FormField>
        <FormField label="الحالة" required {...form.field("status")}>
          <Select
            value={form.values.status}
            onValueChange={(v) => form.setField("status", v as BranchStatus)}
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
      </FormSection>
    </FormSheet>
  )
}
