import type { Metadata } from "next"

import { TeacherSessionsScreen } from "@/components/sessions/sessions-screen"

export const metadata: Metadata = { title: "حصصي" }

export default async function TeacherSessionsPage(props: PageProps<"/teacher/sessions">) {
  const { tab } = await props.searchParams
  return <TeacherSessionsScreen tab={typeof tab === "string" ? tab : undefined} />
}
