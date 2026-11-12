import type { Metadata } from "next"
import { Suspense } from "react"

import { OnboardingSubmissionsScreen } from "@/components/student-onboarding/admin-onboarding-submissions"

export const metadata: Metadata = { title: "طلبات الاستكمال" }

/** TEMPORARY module (STUDENT_ONBOARDING_ENABLED): review of the submissions. */
export default function Page() {
  // The opened submission comes from the address (?id=…, from a notification)
  return (
    <Suspense>
      <OnboardingSubmissionsScreen />
    </Suspense>
  )
}
