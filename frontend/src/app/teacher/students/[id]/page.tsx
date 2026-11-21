import type { Metadata } from "next"

import { TeacherStudentScreen } from "@/components/teacher/teacher-screens"

export const metadata: Metadata = { title: "ملف الطالب" }

export default async function Page(props: PageProps<"/teacher/students/[id]">) {
  const { id } = await props.params
  const { tab, surah } = await props.searchParams
  return (
    <TeacherStudentScreen
      id={id}
      tab={typeof tab === "string" ? tab : undefined}
      surah={typeof surah === "string" && /^\d+$/.test(surah) ? Number(surah) : undefined}
    />
  )
}
