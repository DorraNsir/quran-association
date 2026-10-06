import type { Metadata } from "next"

import { RegistrationRequestsView } from "@/components/registration/registration-views"
import { MOCK_TODAY } from "@/lib/mock"

export const metadata: Metadata = { title: "طلبات التسجيل" }

export default function RegistrationRequestsPage() {
  return <RegistrationRequestsView today={MOCK_TODAY} />
}
