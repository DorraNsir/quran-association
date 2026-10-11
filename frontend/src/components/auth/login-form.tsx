"use client"

import { AlertCircle, Eye, EyeOff, Info, Loader2, Lock, LogIn, UserRound } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import { AssociationLogo } from "@/components/layout/brand"
import { FormField } from "@/components/shared/form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import HeroBackground, { DEFAULT_HERO_THEME } from "@/components/website/hero-background"
import { errorMessage } from "@/lib/api/errors"
import { FALLBACK_ASSOCIATION_NAME, usePublicSiteSettings } from "@/lib/api/public-settings"
import { useAuth } from "@/lib/auth/auth-provider"
import { destinationAfterLogin } from "@/lib/auth/redirects"
import { amiri } from "@/lib/site-font"

import { FullPageLoader } from "./workspace-gate"

/**
 * تسجيل الدخول — accounts are created by the administration (no public
 * sign-up). Real NestJS authentication: the access token stays in memory,
 * the refresh token in an HttpOnly cookie.
 */
export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next")
  const { status, user, restore, login } = useAuth()
  const { data: settings } = usePublicSiteSettings()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in (session cookie): go straight to the workspace
  useEffect(() => {
    if (status === "idle") void restore()
  }, [status, restore])
  useEffect(() => {
    if (status !== "authenticated" || !user) return
    router.replace(
      user.mustChangePassword
        ? `/change-password${next ? `?next=${encodeURIComponent(next)}` : ""}`
        : destinationAfterLogin(user, next)
    )
  }, [status, user, next, router])

  const errors = {
    username: !username.trim() ? "أدخل اسم المستخدم" : undefined,
    password: !password ? "أدخل كلمة المرور" : undefined,
  }
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setError(null)
    if (errors.username || errors.password || pending) return
    setPending(true)
    try {
      await login(username.trim(), password)
      // The redirect effect takes over once the session is set
    } catch (e) {
      setError(errorMessage(e))
      setPassword("")
    } finally {
      setPending(false)
    }
  }

  if (status === "loading" || status === "authenticated") return <FullPageLoader label="جارٍ التحقق من الجلسة…" />

  const notice = params.get("expired")
    ? "انتهت جلستك. يرجى تسجيل الدخول من جديد."
    : params.get("noworkspace")
      ? "لا يملك هذا الحساب فضاء عمل متاحًا. يرجى التواصل مع إدارة الجمعية."
      : null

  return (
    <div className={`${amiri.variable} relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-[#0d1210] px-4 py-10`}>
      {/* The website's animated theme (chosen by the administration) — decorative, behind everything */}
      <HeroBackground variant={settings?.heroTheme ?? DEFAULT_HERO_THEME} lettersFont={amiri.style.fontFamily} textShade={false} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(13,18,16,0.15)_0%,rgba(13,18,16,0.75)_70%)]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-4 text-center text-white">
          <span className="rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-white/20">
            <AssociationLogo className="h-16 w-auto" />
          </span>
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-bold">تسجيل الدخول</h1>
            <p className="text-sm text-white/75">{settings?.name ?? FALLBACK_ASSOCIATION_NAME}</p>
            <p className="font-display text-base text-[#e8cf98]">«خيركم من تعلّم القرآن وعلّمه»</p>
          </div>
        </div>
        <Card className="border-white/10 bg-white/95 shadow-2xl backdrop-blur-sm">
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              {notice && (
                <Alert>
                  <Info aria-hidden />
                  <AlertDescription>{notice}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertCircle aria-hidden />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {/* Right-to-left fields (caret starts on the right, like the rest of the page); Latin usernames still type normally */}
              <FormField id="login-username" label="اسم المستخدم" required error={shown("username")}>
                <div className="relative">
                  <UserRound aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-username"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    className="h-11 ps-9"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={shown("username") ? true : undefined}
                  />
                </div>
              </FormField>
              <FormField id="login-password" label="كلمة المرور" required error={shown("password")}>
                <div className="relative">
                  <Lock aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="h-11 ps-9 pe-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={shown("password") ? true : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute end-1 top-1/2 size-8 -translate-y-1/2"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </FormField>
              <Button type="submit" size="lg" disabled={pending} className="mt-1 h-11 text-base">
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
                تسجيل الدخول
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-5 text-center text-xs leading-relaxed text-white/70">
          الحسابات تُنشأ من طرف إدارة الجمعية. للتسجيل في الأقسام استعمل{" "}
          <Link href="/registration" className="font-medium text-[#e8cf98] underline-offset-4 hover:underline">
            طلب التسجيل
          </Link>
          {" · "}
          <Link href="/" className="font-medium text-[#e8cf98] underline-offset-4 hover:underline">
            العودة إلى الموقع
          </Link>
        </p>
      </div>
    </div>
  )
}
