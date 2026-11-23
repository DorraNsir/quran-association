import type { Metadata } from "next"

import { RecitationsScreen } from "@/components/teacher/recitations/recitations-screen"

export const metadata: Metadata = { title: "متابعة العرضات" }

/** «متابعة العرضات»: ?student=<id>&surah=<n> opens a student and highlights one surah («سجل العرضات»). */
export default async function Page(props: PageProps<"/teacher/recitations">) {
  const { student, surah } = await props.searchParams
  return (
    <RecitationsScreen
      key={typeof student === "string" ? student : ""}
      initialStudentId={typeof student === "string" ? student : undefined}
      initialSurah={typeof surah === "string" && /^\d+$/.test(surah) && Number(surah) >= 1 && Number(surah) <= 114 ? Number(surah) : undefined}
    />
  )
}
