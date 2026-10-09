import type { Metadata } from "next"

import { RegistrationRequestsView } from "@/components/registration/registration-views"

export const metadata: Metadata = { title: "طلبات التسجيل" }

export default function RegistrationRequestsPage() {
  return <RegistrationRequestsView />
}
