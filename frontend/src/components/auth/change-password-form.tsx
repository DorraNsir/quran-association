"use client"

import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldAlert } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AssociationLogo } from "@/components/layout/brand"
import { FormField } from "@/components/shared/form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { errorMessage } from "@/lib/api/errors"
import { useAuth } from "@/lib/auth/auth-provider"
import { destinationAfterLogin } from "@/lib/auth/redirects"
import { landingPath } from "@/lib/auth/session-user"

import { FullPageLoader } from "./workspace-gate"

/** Same policy as the API (8–128 characters). */
export function passwordPolicyError(value: string) {
  if (value.length < 8) return "كلمة المرور يجب أن تتكوّن من 8 أحرف على الأقل"
  if (value.length > 128) return "كلمة المرور طويلة جدًا (128 حرفًا على الأكثر)"
  return undefined
}

/**
 * تغيير كلمة المرور — mandatory on first login (mustChangePassword): no
 * workspace opens until it is done. The API ends the other sessions and
 * returns new tokens for this one.
 */
export function ChangePasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next")
  const { status, user, restore, changePassword, logout } = useAuth()
  const [values, setValues] = useState({ current: "", next: "", confirm: "" })
  const [show, setShow] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "idle") void restore()
    if (status === "anonymous") router.replace("/login?next=/change-password")
  }, [status, restore, router])

  if (!user) return <FullPageLoader />
  const forced = user.mustChangePassword

  const errors = {
    current: !values.current ? "أدخل كلمة المرور الحالية" : undefined,
    next: passwordPolicyError(values.next) ?? (values.next === values.current ? "اختر كلمة مرور مختلفة عن الحالية" : undefined),
    confirm: values.confirm !== values.next ? "التأكيد لا يطابق كلمة المرور الجديدة" : undefined,
  }
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setError(null)
    if (Object.values(errors).some(Boolean) || pending) return
    setPending(true)
    try {
      const updated = await changePassword(values.current, values.next)
      toast.success("تم تغيير كلمة المرور بنجاح")
      router.replace(destinationAfterLogin(updated, next))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const field = (key: keyof typeof values, id: string, label: string, autoComplete: string) => (
    <FormField id={id} label={label} required error={shown(key)}>
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        dir="ltr"
        value={values[key]}
        onChange={set(key)}
        aria-invalid={shown(key) ? true : undefined}
      />
    </FormField>
  )

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <AssociationLogo className="h-16 w-auto" />
          <h1 className="text-xl font-semibold">تغيير كلمة المرور</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              {forced && (
                <Alert>
                  <ShieldAlert aria-hidden />
                  <AlertDescription>
                    هذا أول دخول لك أو أُعيد تعيين كلمة مرورك: يجب اختيار كلمة مرور جديدة قبل الوصول إلى فضاء العمل.
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle aria-hidden />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {field("current", "pw-current", "كلمة المرور الحالية", "current-password")}
              {field("next", "pw-new", "كلمة المرور الجديدة", "new-password")}
              {field("confirm", "pw-confirm", "تأكيد كلمة المرور الجديدة", "new-password")}
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setShow((v) => !v)}>
                {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {show ? "إخفاء كلمات المرور" : "إظهار كلمات المرور"}
              </Button>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
                حفظ كلمة المرور
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="mt-5 flex justify-center gap-4 text-sm">
          {forced ? (
            <Button
              variant="link"
              onClick={async () => {
                await logout()
                router.replace("/login")
              }}
            >
              <LogOut aria-hidden />
              تسجيل الخروج
            </Button>
          ) : (
            <Link href={landingPath(user) ?? "/"} className="text-primary underline-offset-4 hover:underline">
              العودة إلى فضاء العمل
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
