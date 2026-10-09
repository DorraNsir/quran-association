"use client"

import { WithLookups } from "@/components/shared/with-lookups"
import { WithTeacherWorkspace } from "@/components/shared/with-workspace"

import { AdminAnnouncements, AnnouncementDetails } from "./announcements-views"
import { ResourceDetails, StaffResources } from "./resources-views"

export function AdminAnnouncementsScreen() {
  return <WithLookups>{(lookups) => <AdminAnnouncements lookups={lookups} />}</WithLookups>
}

export function AdminAnnouncementScreen({ id }: { id: string }) {
  return <WithLookups>{(lookups) => <AnnouncementDetails announcementId={id} workspace="admin" lookups={lookups} />}</WithLookups>
}

export function StaffResourcesScreen({ workspace }: { workspace: "admin" | "teacher" }) {
  return workspace === "admin" ? (
    <WithLookups>{(lookups) => <StaffResources workspace="admin" lookups={lookups} />}</WithLookups>
  ) : (
    <WithTeacherWorkspace>{({ lookups }) => <StaffResources workspace="teacher" lookups={lookups} />}</WithTeacherWorkspace>
  )
}

export function StaffResourceScreen({ workspace, id }: { workspace: "admin" | "teacher"; id: string }) {
  return workspace === "admin" ? (
    <WithLookups>{(lookups) => <ResourceDetails resourceId={id} workspace="admin" lookups={lookups} />}</WithLookups>
  ) : (
    <WithTeacherWorkspace>{({ lookups }) => <ResourceDetails resourceId={id} workspace="teacher" lookups={lookups} />}</WithTeacherWorkspace>
  )
}
