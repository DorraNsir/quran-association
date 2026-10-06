import type { Metadata } from "next"

import { RegistrationRequestDetails } from "@/components/registration/registration-views"
import { getCurrentUser } from "@/lib/auth/current-user"
import { CURRENT_ACADEMIC_YEAR, lookups, MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "طلب تسجيل" }

/** Resolved from the shared store (requests submitted in this session included). */
export default async function RegistrationRequestPage(props: PageProps<"/admin/registration-requests/[id]">) {
  const { id } = await props.params
  const user = await getCurrentUser()
  return (
    <RegistrationRequestDetails requestId={id} reviewerId={user.id} lookups={lookups}
      academicYearId={CURRENT_ACADEMIC_YEAR.id} today={MOCK_TODAY} />
  )
}
