"use client"

import { Info } from "lucide-react"

import { FormField } from "@/components/shared/form"
import { AutoTextarea } from "@/components/teacher/work-followup/auto-textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { useFormState } from "@/hooks/use-form-state"
import type { OnboardingStudentFields } from "@/lib/api/student-onboarding"
import { todayInTunis } from "@/lib/dates"
import { ageOn } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import { isValidCin, normalizePhone, PHONE_HINT, phoneError, requiredText } from "@/lib/validation"
import type { Gender } from "@/types/domain"

/** The student fields of the admin student form (no photo, no class, no account). */
export interface StudentFieldValues {
  firstName: string
  lastName: string
  gender: Gender | ""
  dateOfBirth: string
  cin: string
  phone: string
  guardianPhone: string
  address: string
}

export function toFieldValues(f?: Partial<OnboardingStudentFields>): StudentFieldValues {
  return {
    firstName: f?.firstName ?? "",
    lastName: f?.lastName ?? "",
    gender: f?.gender ?? "",
    dateOfBirth: f?.dateOfBirth ?? "",
    cin: f?.cin ?? "",
    phone: f?.phone ?? "",
    guardianPhone: f?.guardianPhone ?? "",
    address: f?.address ?? "",
  }
}

const ageFrom = (dateOfBirth: string) => (dateOfBirth ? ageOn(dateOfBirth, todayInTunis()) : null)

/** The admin student form's rules and messages (the API re-checks them). */
export function validateFields(v: StudentFieldValues) {
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
  }
}

export function toPayload(v: StudentFieldValues): OnboardingStudentFields {
  return {
    firstName: v.firstName.trim(),
    lastName: v.lastName.trim(),
    gender: v.gender as Gender,
    dateOfBirth: v.dateOfBirth,
    address: v.address.trim(),
    phone: normalizePhone(v.phone) || null,
    guardianPhone: normalizePhone(v.guardianPhone) || null,
    cin: v.cin.trim() || null,
  }
}

/** The fields themselves — used by the public form and by the admin's «تعديل البيانات». */
export function StudentFields({ form }: { form: ReturnType<typeof useFormState<StudentFieldValues>> }) {
  const { values, setField } = form
  const age = ageFrom(values.dateOfBirth)
  const isMinor = age !== null && age < 18
  const field = form.field
  const input = form.inputProps

  return (
    <>
      <FormField label="الاسم" required {...field("firstName")}>
        <Input {...input("firstName")} autoComplete="given-name" maxLength={80} />
      </FormField>
      <FormField label="اللقب" required {...field("lastName")}>
        <Input {...input("lastName")} autoComplete="family-name" maxLength={80} />
      </FormField>
      <FormField
        label="تاريخ الولادة"
        required
        {...field("dateOfBirth")}
        description={age !== null && age >= 0 ? `العمر: ${age} سنة` : undefined}
      >
        <Input type="date" dir="ltr" max={todayInTunis()} {...input("dateOfBirth")} />
      </FormField>
      <FormField label="الجنس" required {...field("gender")}>
        <Select
          value={values.gender}
          onValueChange={(v) => {
            setField("gender", v as Gender)
            form.touch("gender")
          }}
        >
          <SelectTrigger id={field("gender").id} className="w-full" aria-invalid={field("gender").error ? true : undefined}>
            <SelectValue placeholder="اختر" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="MALE">{labels.gender.MALE}</SelectItem>
            <SelectItem value="FEMALE">{labels.gender.FEMALE}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="رقم بطاقة التعريف" optional description="للطلبة الذين يملكون بطاقة تعريف وطنية." {...field("cin")}>
        <Input dir="ltr" inputMode="numeric" maxLength={8} {...input("cin")} />
      </FormField>
      {isMinor && (
        <p className="flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-soft-foreground sm:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          الطالب قاصر: رقم هاتف الولي إلزامي، ورقم الطالب اختياري.
        </p>
      )}
      <FormField label="هاتف الطالب" required={!isMinor && age !== null} optional={isMinor} description={PHONE_HINT} {...field("phone")}>
        <Input type="tel" dir="ltr" inputMode="tel" autoComplete="tel" {...input("phone")} />
      </FormField>
      <FormField label="هاتف الولي" required={isMinor} optional={!isMinor} description={PHONE_HINT} {...field("guardianPhone")}>
        <Input type="tel" dir="ltr" inputMode="tel" {...input("guardianPhone")} />
      </FormField>
      <FormField label="العنوان" required className="sm:col-span-2" {...field("address")}>
        <AutoTextarea
          id={field("address").id}
          value={values.address}
          onChange={(e) => setField("address", e.target.value)}
          onBlur={() => form.touch("address")}
          maxLength={200}
          autoComplete="street-address"
          aria-invalid={field("address").error ? true : undefined}
        />
      </FormField>
    </>
  )
}
