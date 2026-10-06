"use client"

import { FileQuestion } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { allStudents, useOperations } from "@/lib/store/operations"
import type { ID } from "@/types/domain"

import { StudentProfile } from "./student-profile"

/** Profile of a student that exists only in the shared store (admitted in this session). */
export function AdmittedStudentProfile({ studentId, initialTab, userId }: { studentId: ID; initialTab?: string; userId: ID }) {
  const state = useOperations()
  const students = allStudents(state)
  const student = students.find((s) => s.id === studentId)
  if (!student) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={FileQuestion}
          title="الملف غير موجود"
          description="ربما أُضيف هذا الطالب في جلسة تجريبية سابقة ولم يُحفظ في قاعدة بيانات."
          action={<Button asChild variant="outline"><Link href="/admin/students">العودة إلى الطلبة</Link></Button>}
        />
      </Card>
    )
  }
  return <StudentProfile student={student} students={students} initialTab={initialTab} userId={userId} />
}
