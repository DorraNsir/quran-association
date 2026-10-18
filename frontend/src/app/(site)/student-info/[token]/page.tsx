import type { Metadata } from "next"

import { PublicOnboardingForm } from "@/components/student-onboarding/public-onboarding-form"

export const metadata: Metadata = {
  title: "استكمال بيانات الطالب",
  // A personal link: never indexed
  robots: { index: false, follow: false },
}

/** TEMPORARY «استكمال بيانات الطلبة»: the public form of one class link (no account needed). */
export default async function Page(props: PageProps<"/student-info/[token]">) {
  const { token } = await props.params
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <PublicOnboardingForm token={token} />
    </div>
  )
}
