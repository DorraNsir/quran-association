import { useSyncExternalStore } from "react"

import {
  buildNotifications,
  getAnnouncementRecipientUserIds,
  getResourceRecipientUserIds,
  type Directory,
} from "@/lib/communication"
import { upsertMemorization, type MemorizationUpdate } from "@/lib/memorization"
import {
  createStudentPaymentObligation,
  getObligationSummary,
  getStudentApplicableGroupFee,
  getStudentPaymentObligation,
  paymentAmountError,
} from "@/lib/payments"
import { canReviewRequest, type RegistrationFields } from "@/lib/registration"
import { academicYearErrors, buildAcademicYear, withCurrentAcademicYear, type AcademicYearDraft } from "@/lib/academic-years"
import { academicYears } from "@/lib/mock/academic-years"
import { branches, rooms } from "@/lib/mock/branches"
import { announcements, announcementTargets, notifications, resources, resourceTargets } from "@/lib/mock/communication"
import { groupFees, paymentObligations, payments, registrationRequests } from "@/lib/mock/finance"
import { associationSettings, platformSettings } from "@/lib/mock/settings"
import * as website from "@/lib/mock/website"
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
  AcademicYear,
  Achievement,
  AdministrationMember,
  Announcement,
  AnnouncementTarget,
  AssociationSettings,
  AttendanceStatus,
  GalleryImage,
  GroupFee,
  HeroSlide,
  ID,
  ISODate,
  MemorizationProgress,
  NewsArticle,
  Payment,
  PaymentObligation,
  PlatformSettings,
  PublicEvent,
  PublicGroupListing,
  PublicProgram,
  QuranGraduate,
  RegistrationRequest,
  RegistrationRequestSource,
  Resource,
  ResourceTarget,
  ServiceOffering,
  Session,
  SessionStatus,
  SiteSettings,
  Student,
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
  /** A request is not a student: admission creates the student separately */
  registrationRequests: RegistrationRequest[]
  /** Students created in this session by admitting a request (seed students are static) */
  admittedStudents: Student[]
  groupFees: GroupFee[]
  paymentObligations: PaymentObligation[]
  payments: Payment[]
  /** Platform settings (/admin/settings): identity, configuration and the academic years (Part 4 model) */
  associationSettings: AssociationSettings
  platformSettings: PlatformSettings
  academicYears: AcademicYear[]
  /** Public website (CMS) — the admin edits these, public pages read them */
  siteSettings: SiteSettings
  heroSlides: HeroSlide[]
  serviceOfferings: ServiceOffering[]
  publicPrograms: PublicProgram[]
  publicGroups: PublicGroupListing[]
  publicEvents: PublicEvent[]
  newsArticles: NewsArticle[]
  galleryImages: GalleryImage[]
  quranGraduates: QuranGraduate[]
  administrationMembers: AdministrationMember[]
  achievements: Achievement[]
}

/** CMS collections and their item type. */
export interface CmsCollections {
  heroSlides: HeroSlide
  serviceOfferings: ServiceOffering
  publicPrograms: PublicProgram
  publicGroups: PublicGroupListing
  publicEvents: PublicEvent
  newsArticles: NewsArticle
  galleryImages: GalleryImage
  quranGraduates: QuranGraduate
  administrationMembers: AdministrationMember
  achievements: Achievement
}
export type CmsCollection = keyof CmsCollections
export type CmsDraft<K extends CmsCollection> = Omit<CmsCollections[K], "id" | "createdAt" | "updatedAt" | "displayOrder"> & {
  id?: ID
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
  registrationRequests,
  admittedStudents: [],
  groupFees,
  paymentObligations,
  payments,
  associationSettings,
  platformSettings,
  academicYears,
  siteSettings: website.siteSettings,
  heroSlides: website.heroSlides,
  serviceOfferings: website.serviceOfferings,
  publicPrograms: website.publicPrograms,
  publicGroups: website.publicGroups,
  publicEvents: website.publicEvents,
  newsArticles: website.newsArticles,
  galleryImages: website.galleryImages,
  quranGraduates: website.quranGraduates,
  administrationMembers: website.administrationMembers,
  achievements: website.achievements,
}

/** Seed students + students admitted in this session. */
export function allStudents(current: Pick<OperationsState, "admittedStudents">) {
  return [...students, ...current.admittedStudents]
}

export type GroupFeeDraft = Omit<GroupFee, "id" | "createdAt" | "updatedAt"> & { id?: ID }
export interface PaymentInput {
  obligationId: ID
  amount: number
  paidAt: ISODate
  receiptIssued: boolean
  periodNumber?: number
  note?: string
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

  /** Public form or admin entry — the same entity, always PENDING, never a student. */
  submitRegistrationRequest(fields: RegistrationFields, source: RegistrationRequestSource, today: ISODate) {
    const request: RegistrationRequest = { ...fields, id: newMockId("rr"), source, status: "PENDING", submittedAt: today }
    setState({ ...state, registrationRequests: [request, ...state.registrationRequests] })
    return request.id
  },

  refuseRegistrationRequest(requestId: ID, reviewerId: ID, today: ISODate) {
    setState({
      ...state,
      registrationRequests: state.registrationRequests.map((r) =>
        r.id === requestId && canReviewRequest(r) ? { ...r, status: "REFUSED", reviewedAt: today, reviewedByUserId: reviewerId } : r
      ),
    })
  },

  /**
   * Admission: creates ONE student from a pending request, links it and
   * creates the student's payment obligation from their group's fee.
   * A request that already produced a student is never converted again.
   */
  admitRegistrationRequest(requestId: ID, student: Student, reviewerId: ID, today: ISODate, academicYearId: ID) {
    const request = state.registrationRequests.find((r) => r.id === requestId)
    if (!request || !canReviewRequest(request)) return false
    const fee = getStudentApplicableGroupFee(student, academicYearId, groupClasses, state.groupFees)
    setState({
      ...state,
      admittedStudents: [...state.admittedStudents, student],
      registrationRequests: state.registrationRequests.map((r) =>
        r.id === requestId ? { ...r, status: "ACCEPTED", reviewedAt: today, reviewedByUserId: reviewerId, createdStudentId: student.id } : r
      ),
      paymentObligations: fee
        ? [...state.paymentObligations, createStudentPaymentObligation(student.id, fee, today, () => newMockId("po"))]
        : state.paymentObligations,
    })
    return true
  },

  /**
   * Creates or edits a group fee. A NEW active fee creates the missing
   * obligations of the group's students for that year; editing a fee never
   * rewrites existing obligations (their amount is historical).
   */
  saveGroupFee(draft: GroupFeeDraft, today: ISODate) {
    const existing = draft.id ? state.groupFees.find((f) => f.id === draft.id) : undefined
    const { id: _ignored, ...fields } = draft
    void _ignored
    const fee: GroupFee = existing ? { ...existing, ...fields, updatedAt: today } : { ...fields, id: newMockId("fee"), createdAt: today, updatedAt: today }
    const fees = existing ? state.groupFees.map((f) => (f.id === fee.id ? fee : f)) : [...state.groupFees, fee]
    const created =
      fee.isActive && fee.academicYearId
        ? allStudents(state)
            .filter((st) => st.status !== "ARCHIVED" && groupClasses.find((c) => c.id === st.groupClassId)?.groupId === fee.groupId)
            .filter((st) => !getStudentPaymentObligation(st.id, fee.academicYearId!, state.paymentObligations))
            .map((st) => createStudentPaymentObligation(st.id, fee, today, () => newMockId("po")))
        : []
    setState({ ...state, groupFees: fees, paymentObligations: [...state.paymentObligations, ...created] })
  },

  /** One cash transaction. Rejected when it would exceed what remains (no credit balance). */
  recordPayment(input: PaymentInput, recordedByUserId: ID, today: ISODate) {
    const obligation = state.paymentObligations.find((o) => o.id === input.obligationId)
    if (!obligation) return "الالتزام غير موجود"
    const error = paymentAmountError(input.amount, getObligationSummary(obligation, state.payments).remaining)
    if (error) return error
    const payment: Payment = {
      id: newMockId("pay"),
      obligationId: obligation.id,
      studentId: obligation.studentId,
      amount: input.amount,
      paidAt: input.paidAt,
      method: "CASH",
      receiptIssued: input.receiptIssued,
      periodNumber: input.periodNumber,
      note: input.note?.trim() || undefined,
      recordedByUserId,
      createdAt: today,
    }
    setState({ ...state, payments: [...state.payments, payment] })
    return undefined
  },

  /** Only the receipt state changes — amounts and totals stay exactly the same. */
  setReceiptIssued(paymentId: ID, receiptIssued: boolean) {
    setState({ ...state, payments: state.payments.map((p) => (p.id === paymentId ? { ...p, receiptIssued } : p)) })
  },

  /* ---------- Platform settings ---------- */

  updateAssociationSettings(patch: Partial<Omit<AssociationSettings, "updatedAt">>, today: ISODate) {
    setState({ ...state, associationSettings: { ...state.associationSettings, ...patch, updatedAt: today } })
  },

  updatePlatformSettings(patch: Partial<Omit<PlatformSettings, "updatedAt">>, today: ISODate) {
    setState({ ...state, platformSettings: { ...state.platformSettings, ...patch, updatedAt: today } })
  },

  /** Creates or edits a year in THE academic-year collection; returns field errors when invalid. */
  saveAcademicYear(draft: AcademicYearDraft) {
    const errors = academicYearErrors(draft, state.academicYears)
    if (Object.keys(errors).length) return { errors }
    const existing = draft.id ? state.academicYears.find((y) => y.id === draft.id) : undefined
    const year = buildAcademicYear(draft, existing, existing?.id ?? newMockId("year"))
    setState({ ...state, academicYears: existing ? state.academicYears.map((y) => (y.id === year.id ? year : y)) : [...state.academicYears, year] })
    return { id: year.id }
  },

  /** Only the isCurrent flags change — progress, payments, sessions… keep their own academicYearId. */
  setCurrentAcademicYear(id: ID) {
    setState({ ...state, academicYears: withCurrentAcademicYear(state.academicYears, id) })
  },

  /* ---------- Public website CMS (one record = what the public sees) ---------- */

  updateSiteSettings(patch: Partial<SiteSettings>, today: ISODate) {
    setState({ ...state, siteSettings: { ...state.siteSettings, ...patch, updatedAt: today } })
  },

  /** Creates (appended last in display order) or updates a CMS item. */
  saveCmsItem<K extends CmsCollection>(collection: K, draft: CmsDraft<K>, today: ISODate) {
    const list = state[collection] as CmsCollections[K][]
    const existing = draft.id ? list.find((i) => i.id === draft.id) : undefined
    const item = existing
      ? ({ ...existing, ...draft, updatedAt: today } as CmsCollections[K])
      : ({
          ...draft,
          id: newMockId(collection),
          displayOrder: Math.max(0, ...list.map((i) => ("displayOrder" in i ? (i.displayOrder as number) : 0))) + 1,
          createdAt: today,
          updatedAt: today,
        } as unknown as CmsCollections[K])
    setState({ ...state, [collection]: existing ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item] })
    return item.id
  },

  deleteCmsItem(collection: CmsCollection, id: ID) {
    setState({ ...state, [collection]: (state[collection] as { id: ID }[]).filter((i) => i.id !== id) })
  },

  /** Toggles a boolean flag (isPublished, isActive, isFeatured, isPublic, isCancelled…). */
  setCmsFlag(collection: CmsCollection, id: ID, key: string, value: boolean, today: ISODate) {
    setState({
      ...state,
      [collection]: (state[collection] as { id: ID }[]).map((i) => (i.id === id ? { ...i, [key]: value, updatedAt: today } : i)),
    })
  },

  /** Swaps an item with its neighbour in display order ("up" = earlier). */
  moveCmsItem(collection: CmsCollection, id: ID, direction: "up" | "down") {
    const list = [...(state[collection] as { id: ID; displayOrder: number }[])].sort((a, b) => a.displayOrder - b.displayOrder)
    const index = list.findIndex((i) => i.id === id)
    const other = list[direction === "up" ? index - 1 : index + 1]
    if (index < 0 || !other) return
    const current = list[index]
    const swapped = new Map([
      [current.id, other.displayOrder],
      [other.id, current.displayOrder],
    ])
    setState({
      ...state,
      [collection]: (state[collection] as { id: ID; displayOrder: number }[]).map((i) =>
        swapped.has(i.id) ? { ...i, displayOrder: swapped.get(i.id)! } : i
      ),
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
