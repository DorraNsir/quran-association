"use client"

import { Info } from "lucide-react"

import { TeacherRoleBadge } from "@/components/shared/badges"
import { FormField, FormSection, FormSheet, PhotoInput } from "@/components/shared/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFormState } from "@/hooks/use-form-state"
import { teacherAssignments, type Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import { MOCK_TODAY, newMockId } from "@/lib/mock/reference-date"
import { normalizePhone, PHONE_HINT, phoneError, requiredText } from "@/lib/validation"
import type { Gender, Teacher, TeacherStatus } from "@/types/domain"

interface TeacherFormValues {
  photoUrl?: string
  firstName: string
  lastName: string
  gender: Gender | ""
  qualification: string
  phone: string
  email: string
  joinedAt: string
  status: TeacherStatus
}

function toValues(t?: Teacher): TeacherFormValues {
  return {
    photoUrl: t?.photoUrl,
    firstName: t?.firstName ?? "",
    lastName: t?.lastName ?? "",
    gender: t?.gender ?? "",
    qualification: t?.qualification ?? "",
    phone: t?.phone ?? "",
    email: t?.email ?? "",
    joinedAt: t?.joinedAt ?? MOCK_TODAY,
    status: t?.status ?? "ACTIVE",
  }
}

function validate(v: TeacherFormValues) {
  return {
    firstName: requiredText(v.firstName, "الاسم مطلوب"),
    lastName: requiredText(v.lastName, "اللقب مطلوب"),
    gender: v.gender ? undefined : "اختر الجنس",
    phone: phoneError(v.phone, { required: true }),
    email:
      v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? "بريد إلكتروني غير صالح" : undefined,
    joinedAt: requiredText(v.joinedAt, "تاريخ الالتحاق مطلوب"),
  }
}

export function TeacherFormSheet({
  open,
  onOpenChange,
  teacher,
  lookups,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  teacher?: Teacher
  lookups: Lookups
  onSave: (teacher: Teacher) => void
}) {
  const form = useFormState(`teacher-${teacher?.id ?? "new"}`, toValues(teacher), validate)
  const { values, setField } = form
  const assignments = teacher ? teacherAssignments(teacher.id, lookups) : []

  const submit = form.handleSubmit((v) =>
    onSave({
      ...teacher,
      id: teacher?.id ?? newMockId("t"),
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      gender: v.gender as Gender,
      qualification: v.qualification.trim() || undefined,
      phone: normalizePhone(v.phone),
      email: v.email.trim() || undefined,
      photoUrl: v.photoUrl,
      joinedAt: v.joinedAt,
      status: v.status,
    })
  )

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={teacher ? "تعديل بيانات المعلم" : "إضافة معلم جديد"}
      description="الحقول المعلَّمة بـ * إلزامية."
      onSubmit={submit}
      submitLabel={teacher ? "حفظ التعديلات" : "إضافة المعلم"}
    >
      <FormSection title="الهوية">
        <PhotoInput
          id={form.field("photoUrl").id}
          name={`${values.firstName} ${values.lastName}`.trim()}
          value={values.photoUrl}
          onChange={(url) => setField("photoUrl", url)}
        />
        <FormField label="الاسم" required {...form.field("firstName")}>
          <Input {...form.inputProps("firstName")} autoComplete="given-name" />
        </FormField>
        <FormField label="اللقب" required {...form.field("lastName")}>
          <Input {...form.inputProps("lastName")} autoComplete="family-name" />
        </FormField>
        <FormField label="الجنس" required {...form.field("gender")}>
          <Select
            value={values.gender}
            onValueChange={(v) => {
              setField("gender", v as Gender)
              form.touch("gender")
            }}
          >
            <SelectTrigger
              id={form.field("gender").id}
              className="w-full"
              aria-invalid={form.field("gender").error ? true : undefined}
            >
              <SelectValue placeholder="اختر" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="MALE">{labels.gender.MALE}</SelectItem>
              <SelectItem value="FEMALE">{labels.gender.FEMALE}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label="المؤهل"
          optional
          description="مثال: إجازة في رواية حفص عن عاصم"
          {...form.field("qualification")}
        >
          <Input {...form.inputProps("qualification")} />
        </FormField>
      </FormSection>

      <FormSection title="التواصل">
        <FormField label="الهاتف" required description={PHONE_HINT} {...form.field("phone")}>
          <Input type="tel" dir="ltr" inputMode="tel" autoComplete="tel" {...form.inputProps("phone")} />
        </FormField>
        <FormField label="البريد الإلكتروني" optional {...form.field("email")}>
          <Input type="email" dir="ltr" autoComplete="email" {...form.inputProps("email")} />
        </FormField>
      </FormSection>

      <FormSection title="الالتحاق بالجمعية">
        <FormField label="تاريخ الالتحاق" required {...form.field("joinedAt")}>
          <Input type="date" {...form.inputProps("joinedAt")} />
        </FormField>
        <FormField label="الحالة" required {...form.field("status")}>
          <Select value={values.status} onValueChange={(v) => setField("status", v as TeacherStatus)}>
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

      <section className="space-y-3 rounded-lg border bg-muted/40 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Info className="size-4 text-primary" aria-hidden />
          المجموعات المسندة
        </p>
        {assignments.length > 0 ? (
          <ul className="space-y-2">
            {assignments.map(({ groupClass, group, branch, role }) => (
              <li key={groupClass.id} className="flex items-center justify-between gap-2 text-sm">
                {group?.name} · {branch?.name}
                <TeacherRoleBadge role={role} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد مجموعات مسندة بعد.</p>
        )}
        <p className="text-xs text-muted-foreground">
          يُحدَّد دور المعلم (مشرف أو مساعد) من صفحة كل مجموعة، لأن التعيين خاص بالمجموعة.
        </p>
      </section>
    </FormSheet>
  )
}
