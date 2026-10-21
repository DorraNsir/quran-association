"use client"

import { CircleCheck, Clock, Info, Link2Off, Loader2, ShieldCheck } from "lucide-react"
import { useState } from "react"

import { FormSection, PhotoInput } from "@/components/shared/form"
import { FormErrorAlert } from "@/components/shared/form-error-alert"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useFormState } from "@/hooks/use-form-state"
import { ApiError, errorMessage } from "@/lib/api/errors"
import { submitOnboarding, useResolveOnboardingLink, type Submitter } from "@/lib/api/student-onboarding"
import { cn } from "@/lib/utils"

import { StudentFields, toFieldValues, toPayload, validateFields } from "./onboarding-fields"

const EXPIRED = "انتهت صلاحية رابط استكمال البيانات. يرجى التواصل مع إدارة الجمعية."
const INVALID = "هذا الرابط غير صالح أو تم تعطيله. يرجى التواصل مع إدارة الجمعية."

/**
 * TEMPORARY «استكمال بيانات الطلبة» — the public form of one class link.
 * The class comes from the link (read-only); the submission is reviewed by
 * the administration before anything is created. No account, no password.
 */
export function PublicOnboardingForm({ token }: { token: string }) {
  const link = useResolveOnboardingLink(token)
  const [done, setDone] = useState(false)

  if (link.isPending)
    return (
      <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        جارٍ التحقق من الرابط…
      </Card>
    )
  if (link.isError) {
    const expired = link.error instanceof ApiError && link.error.status === 410
    const known = link.error instanceof ApiError && (link.error.status === 404 || link.error.status === 400 || expired)
    return (
      <StateCard
        icon={expired ? Clock : Link2Off}
        title={expired ? "انتهت صلاحية الرابط" : "رابط غير صالح"}
        text={expired ? EXPIRED : known ? INVALID : errorMessage(link.error)}
      />
    )
  }
  if (done)
    return (
      <StateCard
        icon={CircleCheck}
        tone="success"
        title="تم الإرسال"
        text="تم إرسال بياناتك بنجاح. ستقوم إدارة الجمعية بمراجعتها."
      />
    )

  return <OnboardingForm token={token} info={link.data} onDone={() => setDone(true)} />
}

function OnboardingForm({
  token,
  info,
  onDone,
}: {
  token: string
  info: { branchName: string; groupName: string; supervisorName: string | null }
  onDone: () => void
}) {
  const form = useFormState("onboarding", toFieldValues(), validateFields)
  const [submittedBy, setSubmittedBy] = useState<Submitter | "">("")
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState("") // anti-spam honeypot (hidden)
  const [photoPreview, setPhotoPreview] = useState<string | undefined>()
  const [photo, setPhoto] = useState<File | null>(null)
  const [tried, setTried] = useState(false)
  const extraErrors = {
    submittedBy: submittedBy ? undefined : "حدّد من يملأ الاستمارة",
    consent: consent ? undefined : "يجب الموافقة على استعمال البيانات لإرسال الاستمارة",
  }

  const submit = form.handleSubmit(async (v) => {
    setTried(true)
    if (extraErrors.submittedBy || extraErrors.consent) throw new Error(extraErrors.submittedBy ?? extraErrors.consent)
    await submitOnboarding({ token, submittedBy: submittedBy as Submitter, consent, website, ...toPayload(v) }, photo)
    onDone()
  })

  return (
    <form onSubmit={(e) => (setTried(true), submit(e))} noValidate className="space-y-6">
      <Card className="gap-4 p-5 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">استكمال بيانات الطالب</h1>
          <p className="mt-1 text-sm text-muted-foreground">يرجى تعمير البيانات التالية لاستكمال تسجيلك في منظومة الجمعية.</p>
        </div>
        {/* The class comes from the link — never chosen here */}
        <dl className="grid gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
          <Info2 label="الفرع" value={info.branchName} />
          <Info2 label="المجموعة" value={info.groupName} />
          <Info2 label="الفوج" value={info.supervisorName ? `فوج ${info.supervisorName}` : "—"} />
        </dl>
      </Card>

      <Card className="gap-6 p-5 sm:p-6">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            من يملأ الاستمارة؟ <span className="text-destructive" aria-hidden>*</span>
          </legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:max-w-sm">
            {(
              [
                ["GUARDIAN", "الولي"],
                ["STUDENT", "الطالب نفسه"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={submittedBy === value}
                onClick={() => setSubmittedBy(value)}
                className={cn(
                  "h-10 rounded-lg border text-sm font-medium transition-colors",
                  submittedBy === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tried && extraErrors.submittedBy && <p role="alert" className="text-xs text-destructive">{extraErrors.submittedBy}</p>}
        </fieldset>

        <FormSection title="بيانات الطالب" description="الحقول المعلَّمة بـ * إلزامية.">
          <PhotoInput
            id="onboarding-photo"
            name={`${form.values.firstName} ${form.values.lastName}`.trim()}
            value={photoPreview}
            onChange={setPhotoPreview}
            onFile={setPhoto}
          />
          <StudentFields form={form} />
        </FormSection>

        {/* Honeypot: invisible to people, filled by bots */}
        <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
          <label>
            الموقع
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        <Alert>
          <ShieldCheck aria-hidden />
          <AlertTitle>حماية المعطيات الشخصية</AlertTitle>
          <AlertDescription>
            تُستعمل هذه البيانات من طرف إدارة الجمعية فقط لتسجيل الطالب ومتابعته، ولا تُنشر ولا تُسلَّم لأي طرف آخر. إذا كان الطالب
            قاصرًا، يُستحسن أن يملأ الولي هذه الاستمارة.
          </AlertDescription>
        </Alert>
        <div className="space-y-1">
          <Label className="flex cursor-pointer items-start gap-2 font-normal leading-relaxed">
            <input type="checkbox" className="mt-1 size-4 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            أوافق على استعمال هذه البيانات من طرف الجمعية لغرض التسجيل.
          </Label>
          {tried && extraErrors.consent && <p role="alert" className="text-xs text-destructive">{extraErrors.consent}</p>}
        </div>

        {form.serverError && (
          <FormErrorAlert message={form.serverError} />
        )}
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={form.pending}>
          {form.pending && <Loader2 className="animate-spin" />}
          إرسال البيانات
        </Button>
      </Card>
    </form>
  )
}

function Info2({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}

function StateCard({
  icon: Icon,
  title,
  text,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  text: string
  tone?: "success"
}) {
  return (
    <Card className="items-center gap-3 p-10 text-center">
      <span className={cn("flex size-12 items-center justify-center rounded-full", tone === "success" ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground")}>
        <Icon className="size-6" />
      </span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {tone !== "success" && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="size-3.5" aria-hidden />
          لا يمكن تعديل البيانات بعد إرسالها؛ للتصحيح تواصل مع إدارة الجمعية.
        </p>
      )}
    </Card>
  )
}
