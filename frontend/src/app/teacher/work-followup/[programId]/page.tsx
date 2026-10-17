import type { Metadata } from "next"

import { WorkProgramDetails } from "@/components/teacher/work-followup/work-program-details"

export const metadata: Metadata = { title: "برنامج عمل" }

/** PROTOTYPE: one work program, from the shared mock state (no API). */
export default async function Page(props: PageProps<"/teacher/work-followup/[programId]">) {
  const { programId } = await props.params
  return <WorkProgramDetails programId={programId} />
}
