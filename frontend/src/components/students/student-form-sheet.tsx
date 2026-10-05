"use client"

import { Info } from "lucide-react"

import { GroupSelect } from "@/components/groups/group-select"
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
import { ageOn, groupLocation, indexLookups, type Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import { MOCK_TODAY, newMockId } from "@/lib/mock/reference-date"
import {
  isValidCin,
  normalizePhone,
  PHONE_HINT,
  phoneError,
  requiredText,
} from "@/lib/validation"
import type { Gender, Student, StudentStatus } from "@/types/domain"

interface StudentFormValues {
  photoUrl?: string
  firstName: string
  lastName: string
  gender: Gender | ""
  dateOfBirth: string
  cin: string
  phone: string
  guardianPhone: string
  address: string
  registrationDate: string
  groupId: string
  status: StudentStatus
}

function toValues(student?: Student): StudentFormValues {
  return {
    photoUrl: student?.photoUrl,
    firstName: student?.firstName ?? "",
    lastName: student?.lastName ?? "",
    gender: student?.gender ?? "",
    dateOfBirth: student?.dateOfBirth ?? "",
    cin: student?.cin ?? "",
    phone: student?.phone ?? "",
    guardianPhone: student?.guardianPhone ?? "",
    address: student?.address ?? "",
    registrationDate: student?.registrationDate ?? MOCK_TODAY,
    groupId: student?.groupId ?? "",
    status: student?.status ?? "ACTIVE",
  }
}

function ageFrom(dateOfBirth: string) {
  return dateOfBirth ? ageOn(dateOfBirth, MOCK_TODAY) : null
}

function validate(v: StudentFormValues) {
  const age = ageFrom(v.dateOfBirth)
  const isMinor = age !== null && age < 18
  return {
    firstName: requiredText(v.firstName, "الاسم مطلوب"),
    lastName: requiredText(v.lastName, "اللقب مطلوب"),
    gender: v.gender ? undefined : "اختر الجنس",
    dateOfBirth: !v.dateOfBirth
      ? "تاريخ الولادة مطلوب"
      : age === null || age < 3 || age > 100
        ? "تاريخ ولادة غير منطقي"
        : undefined,
    cin: v.cin && !isValidCin(v.cin) ? "رقم بطاقة التعريف يتكوّن من 8 أرقام" : undefined,
    phone: phoneError(v.phone, { required: !isMinor && age !== null }),
    guardianPhone: phoneError(v.guardianPhone, { required: isMinor }),
    address: requiredText(v.address, "العنوان مطلوب"),
    registrationDate: requiredText(v.registrationDate, "تاريخ التسجيل مطلوب"),
    groupId: v.groupId ? undefined : "يجب أن ينتمي الطالب إلى مجموعة واحدة",
  }
}

export function StudentFormSheet({
  open,
  onOpenChange,
  student,
  lookups,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  student?: Student
  lookups: Lookups
  onSave: (student: Student) => void
}) {
  const form = useFormState(`student-${student?.id ?? "new"}`, toValues(student), validate)
  const { values, setField } = form
  const { branchesById, groupsById } = indexLookups(lookups)
  const age = ageFrom(values.dateOfBirth)
  const isMinor = age !== null && age < 18
  const selectedGroup = groupsById.get(values.groupId)

  const submit = form.handleSubmit((v) => {
    onSave({
      id: student?.id ?? newMockId("s"),
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      gender: v.gender as Gender,
      dateOfBirth: v.dateOfBirth,
      cin: v.cin.trim() || undefined,
      phone: normalizePhone(v.phone) || undefined,
      guardianPhone: normalizePhone(v.guardianPhone) || undefined,
      address: v.address.trim(),
      photoUrl: v.photoUrl,
      registrationDate: v.registrationDate,
      groupId: v.groupId,
      status: v.status,
    })
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={student ? "تعديل بيانات الطالب" : "إضافة طالب جديد"}
      description="الحقول المعلَّمة بـ * إلزامية."
      onSubmit={submit}
      submitLabel={student ? "حفظ التعديلات" : "إضافة الطالب"}
    >
      <FormSection title="الهوية" description="المعلومات الشخصية كما تظهر في وثائق الطالب.">
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
        <FormField label="تاريخ الولادة" required {...form.field("dateOfBirth")}
          description={age !== null && age >= 0 ? `العمر: ${age} سنة` : undefined}
        >
          <Input type="date" max={MOCK_TODAY} {...form.inputProps("dateOfBirth")} />
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
          label="رقم بطاقة التعريف"
          optional
          description="للطلبة الذين يملكون بطاقة تعريف وطنية."
          {...form.field("cin")}
        >
          <Input dir="ltr" inputMode="numeric" maxLength={8} {...form.inputProps("cin")} />
        </FormField>
      </FormSection>

      <FormSection title="التواصل" description="يتم التواصل مع الأولياء هاتفيًا فقط.">
        {isMinor && (
          <p className="flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-soft-foreground sm:col-span-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            الطالب قاصر: رقم هاتف الولي إلزامي، ورقم الطالب اختياري.
          </p>
        )}
        <FormField
          label="هاتف الطالب"
          required={!isMinor && age !== null}
          optional={isMinor}
          description={PHONE_HINT}
          {...form.field("phone")}
        >
          <Input type="tel" dir="ltr" inputMode="tel" autoComplete="tel" {...form.inputProps("phone")} />
        </FormField>
        <FormField
          label="هاتف الولي"
          required={isMinor}
          optional={!isMinor}
          description={PHONE_HINT}
          {...form.field("guardianPhone")}
        >
          <Input type="tel" dir="ltr" inputMode="tel" {...form.inputProps("guardianPhone")} />
        </FormField>
        <FormField label="العنوان" required className="sm:col-span-2" {...form.field("address")}>
          <Input {...form.inputProps("address")} autoComplete="street-address" />
        </FormField>
      </FormSection>

      <FormSection title="التسجيل" description="لكل طالب مجموعة نشطة واحدة فقط.">
        <FormField
          label="المجموعة"
          required
          className="sm:col-span-2"
          description={selectedGroup ? groupLocation(selectedGroup, branchesById) : undefined}
          {...form.field("groupId")}
        >
          <GroupSelect
            id={form.field("groupId").id}
            value={values.groupId}
            onValueChange={(id) => {
              setField("groupId", id)
              form.touch("groupId")
            }}
            groups={lookups.groups}
            branches={lookups.branches}
            invalid={Boolean(form.field("groupId").error)}
            describedBy={form.field("groupId").error ? `${form.field("groupId").id}-error` : undefined}
          />
        </FormField>
        <FormField label="تاريخ التسجيل" required {...form.field("registrationDate")}>
          <Input type="date" {...form.inputProps("registrationDate")} />
        </FormField>
        <FormField label="الحالة" required {...form.field("status")}>
          <Select value={values.status} onValueChange={(v) => setField("status", v as StudentStatus)}>
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
