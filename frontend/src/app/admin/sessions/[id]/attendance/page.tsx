import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { SessionScreen } from "@/components/sessions/session-screen"
import { lookups, MOCK_TODAY, sessions, students } from "@/lib/mock"

export const metadata: Metadata = { title: "تسجيل الحضور" }

export default async function AttendancePage(props: PageProps<"/admin/sessions/[id]/attendance">) {
  const { id } = await props.params
  const session = sessions.find((s) => s.id === id)
  if (!session) notFound()
  return <SessionScreen sessionId={session.id} mode="attendance" lookups={lookups} students={students} today={MOCK_TODAY} />
}
