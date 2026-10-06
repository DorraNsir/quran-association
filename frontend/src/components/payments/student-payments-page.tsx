"use client"

import { PageHeader } from "@/components/shared/page-header"
import type { AcademicYear, ID, ISODate } from "@/types/domain"

import { StudentPayments } from "./payments-views"

/** The current student's own fees and payments — read only (no record / receipt actions). */
export function MyPayments({ studentId, academicYears, today }: { studentId: ID; academicYears: AcademicYear[]; today: ISODate }) {
  return (
    <>
      <PageHeader title="المدفوعات" description="معلوم مجموعتك والدفعات المسجّلة لك مع حالة الوصل." />
      <StudentPayments studentId={studentId} mode="student" academicYears={academicYears} today={today} />
    </>
  )
}
