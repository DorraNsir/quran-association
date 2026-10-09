import type { Metadata } from "next"
import { Suspense } from "react"

import { LoginForm } from "@/components/auth/login-form"
import { FullPageLoader } from "@/components/auth/workspace-gate"

export const metadata: Metadata = { title: "تسجيل الدخول" }

export default function LoginPage() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <LoginForm />
    </Suspense>
  )
}
