import {
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  LayoutGrid,
  NotebookPen,
  Phone,
  ShieldCheck,
  Wallet,
} from "lucide-react"

import { GroupBadge, StatusBadge } from "@/components/shared/badges"
import { PhoneLink } from "@/components/shared/info-list"
import { Breadcrumbs } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ProfileTabs } from "@/components/shared/profile-tabs"
import { StudentAttendanceHistory } from "@/components/attendance/student-attendance-history"
import { StudentMemorization } from "@/components/memorization/student-memorization"
import { StudentPayments } from "@/components/payments/payments-views"
import { StudentTeacherNotes } from "@/components/teacher/teacher-notes"

import { EnrollmentHistory } from "./enrollment-history"
import { StudentOverview } from "./student-overview"
import { StudentProfileActions } from "./student-profile-actions"
import { ageOn, fullName, indexLookups, studentClass } from "@/lib/domain"
import { todayInTunis } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { AccountCard } from "@/components/shared/account-card"
import type { AccountSummary } from "@/lib/api/academic"
import type { Student } from "@/types/domain"

export const STUDENT_PROFILE_TABS = ["overview", "attendance", "memorization", "payments", "notes"]

/**
 * Admin student profile (API data).
 * Financial data is admin-only: teachers and students never get this view.
 */
export function StudentProfile({
  student,
  students,
  lookups,
  initialTab,
  access,
}: {
  student: Student
  /** All known students (rosters for attendance / memorization) */
  students: Student[]
  lookups: Lookups
  initialTab?: string
  /** The student's Person and login account (admin account management) */
  access?: { personId: string; account: AccountSummary | null }
}) {
  const today = todayInTunis()
  const cls = studentClass(student, indexLookups(lookups))
  const group = cls?.group
  const name = fullName(student)

  return (
    <>
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "الطلبة", href: "/admin/students" }, { label: name }]}
      />
      <ProfileHeader
        name={name}
        photoUrl={student.photoUrl}
        badges={<StatusBadge status={student.status} />}
        meta={
          <>
            {group && (
              <MetaItem icon={BookOpen}>
                <GroupBadge name={group.name} href={`/admin/groups/${group.id}`} />
              </MetaItem>
            )}
            {cls?.supervisor && (
              <MetaItem icon={ShieldCheck}>
                المدرس المشرف: {fullName(cls.supervisor)} · {cls.branch?.name}
              </MetaItem>
            )}
            <MetaItem icon={CalendarDays}>{ageOn(student.dateOfBirth, today)} سنة</MetaItem>
            {(student.phone || student.guardianPhone) && (
              <MetaItem icon={Phone}>
                <PhoneLink phone={student.phone ?? student.guardianPhone} />
                {!student.phone && <span className="text-xs">(الولي)</span>}
              </MetaItem>
            )}
          </>
        }
        actions={<StudentProfileActions student={student} lookups={lookups} />}
      />
      <ProfileTabs
        defaultValue={initialTab}
        tabs={[
          {
            value: "overview",
            label: "نظرة عامة",
            icon: <LayoutGrid aria-hidden />,
            content: (
              <div className="space-y-6">
                <StudentOverview student={student} lookups={lookups} />
                {access && <AccountCard personId={access.personId} account={access.account} role="STUDENT" />}
                <EnrollmentHistory studentId={student.id} />
              </div>
            ),
          },
          {
            value: "attendance",
            label: "الحضور",
            icon: <ClipboardCheck aria-hidden />,
            content: (
              <StudentAttendanceHistory studentId={student.id} />
            ),
          },
          {
            value: "memorization",
            label: "متابعة الحفظ",
            icon: <BookOpenCheck aria-hidden />,
            content: (
              <StudentMemorization studentId={student.id} lookups={lookups} students={students} today={today} />
            ),
          },
          {
            value: "payments",
            label: "المدفوعات",
            icon: <Wallet aria-hidden />,
            content: (
              <StudentPayments studentId={student.id} mode="admin" groupClassId={student.groupClassId || undefined} />
            ),
          },
          {
            value: "notes",
            label: "ملاحظات المعلمين",
            icon: <NotebookPen aria-hidden />,
            content: <StudentTeacherNotes studentId={student.id} lookups={lookups} />,
          },
        ]}
      />
    </>
  )
}
