"use client"

import { useState } from "react"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { FormField } from "@/components/shared/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { RegistrationFields } from "@/lib/registration"
import { normalizePhone, PHONE_HINT, phoneError } from "@/lib/validation"
import type { ISODate } from "@/types/domain"

/**
 * Applicant fields shared by the public form and the admin "add request"
 * dialog — both produce the same RegistrationRequest.
 */
export function useRegistrationForm(today: ISODate) {
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    ageMode: "age" as "age" | "birthDate",
    age: "",
    birthDate: "",
    phone: "",
    studied: "no" as "yes" | "no",
    previousExperience: "",
    notes: "",
  })
  const [submitted, setSubmitted] = useState(false)
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((v) => ({ ...v, [key]: value }))
  const age = Number(values.age)
  const errors = {
    firstName: !values.firstName.trim() ? "الاسم مطلوب" : undefined,
    lastName: !values.lastName.trim() ? "اللقب مطلوب" : undefined,
    age:
      values.ageMode === "age"
        ? !(Number.isInteger(age) && age >= 3 && age <= 99) ? "أدخل عمرًا صحيحًا (بين 3 و99)" : undefined
        : !values.birthDate ? "أدخل تاريخ الميلاد" : values.birthDate >= today ? "تاريخ ميلاد غير منطقي" : undefined,
    phone: phoneError(values.phone, { required: true }),
  }
  const valid = Object.values(errors).every((e) => !e)
  const err = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)

  /** Returns the request fields when valid (and shows errors otherwise). */
  function collect(): RegistrationFields | undefined {
    setSubmitted(true)
    if (!valid) return undefined
    return {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      age: values.ageMode === "age" ? age : undefined,
      birthDate: values.ageMode === "birthDate" ? values.birthDate : undefined,
      phone: normalizePhone(values.phone),
      hasStudiedQuranBefore: values.studied === "yes",
      previousExperience: values.studied === "yes" ? values.previousExperience.trim() || undefined : undefined,
      notes: values.notes.trim() || undefined,
    }
  }

  const fields = (idPrefix: string, subject: "self" | "applicant") => (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${idPrefix}-first`} label="الاسم" required error={err("firstName")}>
        <Input id={`${idPrefix}-first`} value={values.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="given-name" />
      </FormField>
      <FormField id={`${idPrefix}-last`} label="اللقب" required error={err("lastName")}>
        <Input id={`${idPrefix}-last`} value={values.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="family-name" />
      </FormField>
      <div className="space-y-2 sm:col-span-2">
        <ChoiceGroup label="العمر أو تاريخ الميلاد" value={values.ageMode} onChange={(v) => set("ageMode", v)}
          className="grid-cols-2"
          choices={[{ value: "age", label: "العمر" }, { value: "birthDate", label: "تاريخ الميلاد" }]} />
        {values.ageMode === "age" ? (
          <FormField id={`${idPrefix}-age`} label="العمر (بالسنوات)" required error={err("age")}>
            <Input id={`${idPrefix}-age`} type="number" inputMode="numeric" min={3} max={99} dir="ltr" value={values.age}
              onChange={(e) => set("age", e.target.value)} className="sm:w-40" />
          </FormField>
        ) : (
          <FormField id={`${idPrefix}-birth`} label="تاريخ الميلاد" required error={err("age")}>
            <Input id={`${idPrefix}-birth`} type="date" max={today} value={values.birthDate} onChange={(e) => set("birthDate", e.target.value)} className="sm:w-48" />
          </FormField>
        )}
      </div>
      <FormField id={`${idPrefix}-phone`} label="رقم الهاتف" required error={err("phone")} description={PHONE_HINT} className="sm:col-span-2">
        <Input id={`${idPrefix}-phone`} type="tel" inputMode="tel" dir="ltr" value={values.phone} onChange={(e) => set("phone", e.target.value)} className="sm:w-56" />
      </FormField>
      <div className="space-y-2 sm:col-span-2">
        <p className="text-sm font-medium">{subject === "self" ? "هل سبق لك دراسة القرآن؟" : "هل سبق له دراسة القرآن؟"}</p>
        <ChoiceGroup label="دراسة القرآن سابقًا" value={values.studied} onChange={(v) => set("studied", v)} className="grid-cols-2"
          choices={[{ value: "yes", label: "نعم" }, { value: "no", label: "لا" }]} />
        {values.studied === "yes" && (
          <Input aria-label="التجربة السابقة" placeholder="مثال: حفظ جزء عمّ، دراسة في الكتّاب…" value={values.previousExperience}
            onChange={(e) => set("previousExperience", e.target.value)} maxLength={200} />
        )}
      </div>
      <FormField id={`${idPrefix}-notes`} label="معلومات إضافية" optional className="sm:col-span-2">
        <Textarea id={`${idPrefix}-notes`} rows={3} maxLength={500} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </FormField>
    </div>
  )

  return { fields, collect }
}
