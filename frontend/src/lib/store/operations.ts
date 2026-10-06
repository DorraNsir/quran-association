import { useSyncExternalStore } from "react"

import {
  buildNotifications,
  getAnnouncementRecipientUserIds,
  getResourceRecipientUserIds,
  type Directory,
} from "@/lib/communication"
import { upsertMemorization, type MemorizationUpdate } from "@/lib/memorization"
import { branches, rooms } from "@/lib/mock/branches"
import { announcements, announcementTargets, notifications, resources, resourceTargets } from "@/lib/mock/communication"
import { groupClasses, groups } from "@/lib/mock/groups"
import { memorizationProgress } from "@/lib/mock/memorization"
import { newMockId } from "@/lib/mock/reference-date"
import { sessions, studentAttendance, teacherAttendance } from "@/lib/mock/sessions"
import { schedules } from "@/lib/mock/schedules"
import { students } from "@/lib/mock/students"
import { teacherNotes } from "@/lib/mock/teacher-notes"
import { teachers } from "@/lib/mock/teachers"
import { users } from "@/lib/mock/users"
import type {
  Announcement,
  AnnouncementTarget,
  AttendanceStatus,
  ID,
  ISODate,
  MemorizationProgress,
  Resource,
  ResourceTarget,
  Session,
  SessionStatus,
  StudentAttendance,
  TeacherAttendance,
  TeacherNote,
  UserNotification,
} from "@/types/domain"

/**
 * In-memory mock store for operational data (sessions, attendance,
 * memorization tracking, teacher notes, resources, announcements and
 * notifications).
 *
 * Saving attendance on one screen must show up on the session page, the
 * student history and the dashboard, so this state is shared by every
 * client component and kept across client-side navigation (a full reload
 * resets it to the seed). It stands in for API queries/mutations: replace
 * `useOperations` and `operations.*` with fetch hooks when NestJS exists.
 */
export interface OperationsState {
  sessions: Session[]
  studentAttendance: StudentAttendance[]
  teacherAttendance: TeacherAttendance[]
  /** One last-memorized-surah per (student, academic year, semester) */
  memorizationProgress: MemorizationProgress[]
  /** Private teacher notes — internal, never student-facing */
  teacherNotes: TeacherNote[]
  /** One source of truth per concept, read by all workspaces */
  resources: Resource[]
  resourceTargets: ResourceTarget[]
  announcements: Announcement[]
  announcementTargets: AnnouncementTarget[]
  /** Per-user alerts referencing a resource or announcement */
  notifications: UserNotification[]
}

const seed: OperationsState = {
  sessions,
  studentAttendance,
  teacherAttendance,
  memorizationProgress,
  teacherNotes,
  resources,
  resourceTargets,
  announcements,
  announcementTargets,
  notifications,
}

/** Who exists, to compute notification recipients (the API will do this server-side). */
const directory: Directory = { users, students, lookups: { branches, rooms, groups, groupClasses, teachers, schedules } }

export type ResourceDraft = Omit<Resource, "id" | "createdAt" | "updatedAt" | "publishedByUserId"> & { id?: ID }
export type AnnouncementDraft = Omit<Announcement, "id" | "createdAt" | "updatedAt" | "publishedByUserId"> & { id?: ID }

/** Notify everyone the announcement reaches today and who wasn't notified yet. */
function withAnnouncementNotifications(next: OperationsState, announcement: Announcement, today: ISODate): OperationsState {
  const recipients = getAnnouncementRecipientUserIds(announcement, next.announcementTargets, directory, today)
  const added = buildNotifications(
    { type: "ANNOUNCEMENT", id: announcement.id, title: announcement.title },
    recipients,
    next.notifications,
    today,
    () => newMockId("ntf")
  )
  return added.length ? { ...next, notifications: [...added, ...next.notifications] } : next
}
let state = seed
const listeners = new Set<() => void>()

function setState(next: OperationsState) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Server and first client render both use the seed, so hydration always matches. */
export function useOperations() {
  return useSyncExternalStore(subscribe, () => state, () => seed)
}

export interface AttendanceEntry {
  status: AttendanceStatus
  note?: string
}

export const operations = {
  /**
   * Replaces a session's attendance. `complete` marks the session as held
   * (COMPLETED); an incomplete save keeps it SCHEDULED so it stays pending.
   */
  saveAttendance(
    sessionId: ID,
    students: Map<ID, AttendanceEntry>,
    teachers: Map<ID, AttendanceEntry>,
    { complete }: { complete: boolean }
  ) {
    const existing = new Map(
      state.studentAttendance.filter((r) => r.sessionId === sessionId).map((r) => [r.studentId, r.id])
    )
    const existingTeachers = new Map(
      state.teacherAttendance.filter((r) => r.sessionId === sessionId).map((r) => [r.teacherId, r.id])
    )
    setState({
      ...state,
      sessions: state.sessions.map((s) =>
        s.id === sessionId && complete && s.status !== "CANCELLED" ? { ...s, status: "COMPLETED" } : s
      ),
      studentAttendance: [
        ...state.studentAttendance.filter((r) => r.sessionId !== sessionId),
        ...[...students].map(([studentId, entry]) => ({
          id: existing.get(studentId) ?? newMockId("sa"),
          sessionId,
          studentId,
          status: entry.status,
          note: entry.note?.trim() || undefined,
        })),
      ],
      teacherAttendance: [
        ...state.teacherAttendance.filter((r) => r.sessionId !== sessionId),
        ...[...teachers].map(([teacherId, entry]) => ({
          id: existingTeachers.get(teacherId) ?? newMockId("ta"),
          sessionId,
          teacherId,
          status: entry.status,
          note: entry.note?.trim() || undefined,
        })),
      ],
    })
  },

  /** Sets the student's last memorized surah for one semester (update or create — never a new event). */
  saveMemorization(update: MemorizationUpdate) {
    setState({
      ...state,
      memorizationProgress: upsertMemorization(state.memorizationProgress, update, () => newMockId("mp")),
    })
  },

  /** Creates a note, or edits one (only its date and content change). */
  saveTeacherNote(note: Omit<TeacherNote, "id" | "createdAt" | "updatedAt"> & { id?: ID }, today: string) {
    const existing = note.id ? state.teacherNotes.find((n) => n.id === note.id) : undefined
    setState({
      ...state,
      teacherNotes: existing
        ? state.teacherNotes.map((n) =>
            n.id === existing.id ? { ...n, date: note.date, content: note.content.trim(), updatedAt: today } : n
          )
        : [
            ...state.teacherNotes,
            { ...note, id: newMockId("tn"), content: note.content.trim(), createdAt: today, updatedAt: today },
          ],
    })
  },

  deleteTeacherNote(noteId: ID) {
    setState({ ...state, teacherNotes: state.teacherNotes.filter((n) => n.id !== noteId) })
  },

  /**
   * Creates or edits a resource with its targets (ids typed GROUP or
   * GROUP_CLASS). A new resource notifies exactly the student accounts that
   * can see it — computed with the same rule as the student lists.
   */
  saveResource(draft: ResourceDraft, targetIds: ID[], publishedByUserId: ID, today: ISODate) {
    const existing = draft.id ? state.resources.find((r) => r.id === draft.id) : undefined
    const id = existing?.id ?? newMockId("res")
    const { id: _ignored, ...fields } = draft
    void _ignored
    const resource: Resource = existing
      ? { ...existing, ...fields, updatedAt: today }
      : { ...fields, id, publishedByUserId, createdAt: today, updatedAt: today }
    const targets: ResourceTarget[] =
      resource.visibilityType === "ALL_STUDENTS"
        ? []
        : [...new Set(targetIds)].map((targetId) => ({
            id: newMockId("rt"),
            resourceId: id,
            targetType: resource.visibilityType as ResourceTarget["targetType"],
            targetId,
          }))
    const resourceTargets = [...state.resourceTargets.filter((t) => t.resourceId !== id), ...targets]
    const added = existing
      ? []
      : buildNotifications(
          { type: "RESOURCE", id, title: resource.title },
          getResourceRecipientUserIds(resource, resourceTargets, directory),
          state.notifications,
          today,
          () => newMockId("ntf")
        )
    setState({
      ...state,
      resources: existing ? state.resources.map((r) => (r.id === id ? resource : r)) : [resource, ...state.resources],
      resourceTargets,
      notifications: [...added, ...state.notifications],
    })
    return id
  },

  /** Removes the resource, its targets and the alerts pointing to it. */
  deleteResource(resourceId: ID) {
    setState({
      ...state,
      resources: state.resources.filter((r) => r.id !== resourceId),
      resourceTargets: state.resourceTargets.filter((t) => t.resourceId !== resourceId),
      notifications: state.notifications.filter((n) => !(n.entityType === "RESOURCE" && n.entityId === resourceId)),
    })
  },

  /** Creates or edits an announcement; whoever it now reaches (and wasn't notified yet) is notified. */
  saveAnnouncement(draft: AnnouncementDraft, groupClassIds: ID[], publishedByUserId: ID, today: ISODate) {
    const existing = draft.id ? state.announcements.find((a) => a.id === draft.id) : undefined
    const id = existing?.id ?? newMockId("ann")
    const { id: _ignored, ...fields } = draft
    void _ignored
    const announcement: Announcement = existing
      ? { ...existing, ...fields, updatedAt: today }
      : { ...fields, id, publishedByUserId, createdAt: today, updatedAt: today }
    const targets: AnnouncementTarget[] =
      announcement.audienceType === "SPECIFIC_GROUP_CLASSES"
        ? [...new Set(groupClassIds)].map((groupClassId) => ({ id: newMockId("at"), announcementId: id, groupClassId }))
        : []
    const next: OperationsState = {
      ...state,
      announcements: existing ? state.announcements.map((a) => (a.id === id ? announcement : a)) : [announcement, ...state.announcements],
      announcementTargets: [...state.announcementTargets.filter((t) => t.announcementId !== id), ...targets],
    }
    setState(withAnnouncementNotifications(next, announcement, today))
    return id
  },

  setAnnouncementActive(announcementId: ID, isActive: boolean, today: ISODate) {
    const announcement = state.announcements.find((a) => a.id === announcementId)
    if (!announcement) return
    const updated = { ...announcement, isActive, updatedAt: today }
    const next = { ...state, announcements: state.announcements.map((a) => (a.id === announcementId ? updated : a)) }
    setState(isActive ? withAnnouncementNotifications(next, updated, today) : next)
  },

  deleteAnnouncement(announcementId: ID) {
    setState({
      ...state,
      announcements: state.announcements.filter((a) => a.id !== announcementId),
      announcementTargets: state.announcementTargets.filter((t) => t.announcementId !== announcementId),
      notifications: state.notifications.filter((n) => !(n.entityType === "ANNOUNCEMENT" && n.entityId === announcementId)),
    })
  },

  /** Only this user's alert changes — other users' read state is untouched. */
  markNotificationRead(notificationId: ID, userId: ID) {
    setState({
      ...state,
      notifications: state.notifications.map((n) => (n.id === notificationId && n.userId === userId ? { ...n, isRead: true } : n)),
    })
  },

  markAllNotificationsRead(userId: ID) {
    setState({
      ...state,
      notifications: state.notifications.map((n) => (n.userId === userId && !n.isRead ? { ...n, isRead: true } : n)),
    })
  },

  /** Cancelling affects only this dated session — the weekly schedule is untouched. */
  setSessionStatus(sessionId: ID, status: SessionStatus, cancellationReason?: string) {
    setState({
      ...state,
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, status, cancellationReason: status === "CANCELLED" ? cancellationReason?.trim() || undefined : undefined }
          : s
      ),
    })
  },
}
