import type { Metadata } from "next"
import { Suspense } from "react"

import { ChangePasswordForm } from "@/components/auth/change-password-form"
import { FullPageLoader } from "@/components/auth/workspace-gate"

export const metadata: Metadata = { title: "تغيير كلمة المرور" }

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <ChangePasswordForm />
    </Suspense>
  )
}
