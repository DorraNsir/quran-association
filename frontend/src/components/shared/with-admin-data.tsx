"use client"

import { useLookups, useStudents } from "@/lib/api/academic"
import type { Lookups } from "@/lib/domain"
import type { Student } from "@/types/domain"

import { QueryState } from "./query-state"

/** Admin reference data + every student (the association's size keeps this bounded). */
export function WithLookupsAndStudents({
  children,
}: {
  children: (lookups: Lookups, students: Student[]) => React.ReactNode
}) {
  const { lookups, results } = useLookups()
  const students = useStudents()
  return (
    <QueryState query={[...results, students]}>
      {lookups && students.data ? children(lookups, students.data) : null}
    </QueryState>
  )
}
