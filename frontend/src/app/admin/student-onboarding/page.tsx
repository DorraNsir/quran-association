import type { Metadata } from "next"

import { OnboardingLinksScreen } from "@/components/student-onboarding/admin-onboarding-links"

export const metadata: Metadata = { title: "استكمال بيانات الطلبة" }

/** TEMPORARY module (STUDENT_ONBOARDING_ENABLED): links per class. */
export default function Page() {
  return <OnboardingLinksScreen />
}
