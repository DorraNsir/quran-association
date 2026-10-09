import type { Metadata } from "next"

import { TeacherProfile } from "@/components/teachers/teacher-profile"

export const metadata: Metadata = { title: "ملف المعلم" }

export default async function TeacherProfilePage(props: PageProps<"/admin/teachers/[id]">) {
  const { id } = await props.params
  return <TeacherProfile id={id} />
}
