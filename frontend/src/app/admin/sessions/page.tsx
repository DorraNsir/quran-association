import type { Metadata } from "next"

import { AdminSessionsScreen } from "@/components/sessions/sessions-screen"

export const metadata: Metadata = { title: "الحصص" }

/** ?tab=pending opens a specific list (used by dashboard links). */
export default async function SessionsPage(props: PageProps<"/admin/sessions">) {
  const { tab } = await props.searchParams
  return <AdminSessionsScreen tab={typeof tab === "string" ? tab : undefined} />
}
