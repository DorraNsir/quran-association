"use client"

import { AttendanceOverview } from "@/components/attendance/attendance-overview"
import { BranchesView } from "@/components/branches/branches-view"
import { GroupsView } from "@/components/groups/groups-view"
import { MemorizationOverview } from "@/components/memorization/memorization-overview"
import { PaymentsOverview } from "@/components/payments/payments-views"
import { WithLookupsAndStudents } from "@/components/shared/with-admin-data"
import { WithLookups } from "@/components/shared/with-lookups"
import { StudentsView } from "@/components/students/students-view"
import { todayInTunis } from "@/lib/dates"
import { fullName } from "@/lib/domain"

/*
 * Admin list screens: client components that load the admin reference data
 * (React Query) and render the existing views. Page files stay server
 * components and only pass serializable props (render props cannot cross
 * the server → client boundary).
 */

export function BranchesScreen() {
  return <WithLookups>{(lookups) => <BranchesView lookups={lookups} />}</WithLookups>
}

export function GroupsScreen() {
  return <WithLookupsAndStudents>{(lookups, students) => <GroupsView lookups={lookups} students={students} />}</WithLookupsAndStudents>
}

/** ?group=<id> pre-filters the list (used by links from group pages). */
export function StudentsScreen({ groupId }: { groupId?: string }) {
  return (
    <WithLookupsAndStudents>
      {(lookups, students) => (
        <StudentsView
          students={[...students].sort((a, b) => fullName(a).localeCompare(fullName(b), "ar"))}
          initialGroupId={lookups.groups.some((g) => g.id === groupId) ? groupId : undefined}
          lookups={lookups}
        />
      )}
    </WithLookupsAndStudents>
  )
}

export function AttendanceScreen() {
  return <WithLookups>{(lookups) => <AttendanceOverview lookups={lookups} />}</WithLookups>
}

export function MemorizationScreen() {
  return (
    <WithLookupsAndStudents>
      {(lookups, students) => <MemorizationOverview lookups={lookups} students={students} today={todayInTunis()} />}
    </WithLookupsAndStudents>
  )
}

export function PaymentsScreen() {
  return <WithLookups>{(lookups) => <PaymentsOverview lookups={lookups} />}</WithLookups>
}
