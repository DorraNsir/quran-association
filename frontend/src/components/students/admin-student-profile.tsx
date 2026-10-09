"use client"

import { NotFoundState } from "@/components/shared/not-found-state"
import { WithLookupsAndStudents } from "@/components/shared/with-admin-data"
import { useStudentDtos } from "@/lib/api/academic"

import { StudentProfile } from "./student-profile"

export function AdminStudentProfile({ id, initialTab }: { id: string; initialTab?: string }) {
  const dto = useStudentDtos().data?.find((s) => s.id === id)
  return (
    <WithLookupsAndStudents>
      {(lookups, students) => {
        const student = students.find((s) => s.id === id)
        if (!student) return <NotFoundState title="ملف الطالب غير موجود" backHref="/admin/students" backLabel="العودة إلى الطلبة" />
        return <StudentProfile student={student} students={students} lookups={lookups} initialTab={initialTab}
          access={dto ? { personId: dto.person.id, account: dto.account } : undefined} />
      }}
    </WithLookupsAndStudents>
  )
}
