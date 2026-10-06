import type { Metadata } from "next"

import { AdmittedStudentProfile } from "@/components/students/admitted-student-profile"
import { STUDENT_PROFILE_TABS, StudentProfile } from "@/components/students/student-profile"
import { getCurrentUser } from "@/lib/auth/current-user"
import { fullName } from "@/lib/domain"
import { students } from "@/lib/mock"

export function generateStaticParams() {
  return students.map((s) => ({ id: s.id }))
}

export async function generateMetadata(props: PageProps<"/admin/students/[id]">): Promise<Metadata> {
  const { id } = await props.params
  const student = students.find((s) => s.id === id)
  return { title: student ? fullName(student) : "ملف الطالب" }
}

export default async function StudentProfilePage(props: PageProps<"/admin/students/[id]">) {
  const { id } = await props.params
  // ?tab=memorization|attendance|payments opens a tab directly
  const { tab } = await props.searchParams
  const initialTab = typeof tab === "string" && STUDENT_PROFILE_TABS.includes(tab) ? tab : undefined
  const user = await getCurrentUser()
  const student = students.find((s) => s.id === id)
  // Students admitted from a registration request in this session live in the client store
  if (!student) return <AdmittedStudentProfile studentId={id} initialTab={initialTab} userId={user.id} />
  return <StudentProfile student={student} students={students} initialTab={initialTab} userId={user.id} />
}
