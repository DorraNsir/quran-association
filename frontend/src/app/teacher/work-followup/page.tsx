import type { Metadata } from "next"

import { WorkFollowupScreen } from "@/components/teacher/work-followup/work-followup-screen"

export const metadata: Metadata = { title: "متابعة العمل" }

/** PROTOTYPE (mock data, no API) — inside the teacher layout and its auth guard. */
export default function Page() {
  return <WorkFollowupScreen />
}
