import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { SessionScreen } from "@/components/sessions/session-screen"
import { formatDate } from "@/lib/format"
import { branches, groupClasses, groups, lookups, MOCK_TODAY, sessions, students } from "@/lib/mock"

async function findSession(props: PageProps<"/admin/sessions/[id]">) {
  const { id } = await props.params
  return sessions.find((s) => s.id === id)
}

export async function generateMetadata(props: PageProps<"/admin/sessions/[id]">): Promise<Metadata> {
  const session = await findSession(props)
  const groupClass = groupClasses.find((c) => c.id === session?.groupClassId)
  const group = groups.find((g) => g.id === groupClass?.groupId)
  const branch = branches.find((b) => b.id === groupClass?.branchId)
  return { title: session ? `${group?.name} (${branch?.name}) — ${formatDate(session.date)}` : "الحصة" }
}

export default async function SessionPage(props: PageProps<"/admin/sessions/[id]">) {
  const session = await findSession(props)
  if (!session) notFound()
  return <SessionScreen sessionId={session.id} mode="details" lookups={lookups} students={students} today={MOCK_TODAY} />
}
