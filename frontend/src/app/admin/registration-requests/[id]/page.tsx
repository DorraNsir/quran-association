import type { Metadata } from "next"

import { RegistrationRequestDetails } from "@/components/registration/registration-views"

export const metadata: Metadata = { title: "طلب تسجيل" }

export default async function RegistrationRequestPage(props: PageProps<"/admin/registration-requests/[id]">) {
  const { id } = await props.params
  return <RegistrationRequestDetails requestId={id} />
}
