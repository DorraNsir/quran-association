"use client"

import { QueryState } from "@/components/shared/query-state"
import { useLookups, useTeacherDtos } from "@/lib/api/academic"

import { TeachersView } from "./teachers-view"

export function TeachersScreen() {
  const { lookups, results } = useLookups()
  // Accounts linked to teachers (roles come from the API, never inferred)
  const dtos = useTeacherDtos()
  const adminTeacherIds = (dtos.data ?? []).filter((t) => t.account?.roles.includes("ADMIN")).map((t) => t.id)
  return (
    <QueryState query={[...results, dtos]}>
      {lookups && <TeachersView lookups={lookups} adminTeacherIds={adminTeacherIds} />}
    </QueryState>
  )
}
