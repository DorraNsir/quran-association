import type { Metadata } from "next"

import { PublicRegistrationForm } from "@/components/registration/registration-views"
import { PageHero } from "@/components/website/blocks"

export const metadata: Metadata = {
  title: "طلب التسجيل",
  description: "قدّم طلب التسجيل في أقسام الفرع المحلي عمر بن الخطاب.",
}

/**
 * Public pre-registration. Creates a PENDING RegistrationRequest (source
 * PUBLIC_WEBSITE) — never a student, an account, a class or a payment.
 * ?interest=<announced group> records interest only.
 */
export default async function RegistrationPage(props: PageProps<"/registration">) {
  const { interest } = await props.searchParams
  return (
    <>
      <PageHero eyebrow="التسجيل" title="طلب التسجيل" intro="املأ الاستمارة وسيتواصل معك فريق الجمعية لاستكمال التسجيل واختيار القسم المناسب." />
      <div className="px-4 py-10 sm:py-14">
        <PublicRegistrationForm interestId={typeof interest === "string" ? interest : undefined} />
      </div>
    </>
  )
}
