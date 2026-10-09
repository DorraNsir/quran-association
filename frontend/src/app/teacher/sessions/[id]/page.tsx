import type { Metadata } from "next"

import { SessionScreen } from "@/components/sessions/session-screen"

export const metadata: Metadata = { title: "الحصة" }

/** Resolved from the API (the teacher endpoint only returns sessions of the teacher's team). */
export default async function Page(props: PageProps<"/teacher/sessions/[id]">) {
  const { id } = await props.params
  return <SessionScreen sessionId={id} mode="details" workspace="teacher" />
}
