"use client"

import { PageHeader } from "@/components/shared/page-header"
import { StudentPayments } from "./payments-views"

/** The current student's own fees and payments — read only (no record / receipt actions). */
export function MyPayments() {
  return (
    <>
      <PageHeader title="المدفوعات" description="معلوم مجموعتك والدفعات المسجّلة لك مع حالة الوصل." />
      <StudentPayments mode="student" />
    </>
  )
}
