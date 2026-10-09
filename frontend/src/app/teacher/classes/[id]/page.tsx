import type { Metadata } from "next"

import { TeacherClassScreen } from "@/components/teacher/teacher-screens"

export const metadata: Metadata = { title: "المجموعة" }

export default async function Page(props: PageProps<"/teacher/classes/[id]">) {
  const { id } = await props.params
  return <TeacherClassScreen id={id} />
}
