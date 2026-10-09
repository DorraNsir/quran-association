import type { Metadata } from "next"

import { StaffResourceScreen } from "@/components/communication/communication-screens"

export const metadata: Metadata = { title: "المورد" }

export default async function Page(props: PageProps<"/teacher/resources/[id]">) {
  const { id } = await props.params
  return <StaffResourceScreen workspace="teacher" id={id} />
}
