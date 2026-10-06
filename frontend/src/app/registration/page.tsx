import type { Metadata } from "next"

import { PublicRegistrationForm } from "@/components/registration/registration-views"
import { MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "طلب التسجيل" }

/**
 * Public pre-registration (no login, outside every workspace). Only this page
 * of the future public website exists for now. It creates a PENDING request —
 * never a student, an account or a class assignment.
 */
export default function RegistrationPage() {
  return (
    <main className="min-h-svh bg-muted/30 px-4 py-10 sm:py-16">
      <PublicRegistrationForm today={MOCK_TODAY} />
    </main>
  )
}
