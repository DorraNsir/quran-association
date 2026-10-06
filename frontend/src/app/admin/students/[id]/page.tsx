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
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { GroupBadge, StatusBadge } from "@/components/shared/badges"
import { ComingSoon } from "@/components/shared/empty-state"
import { PhoneLink } from "@/components/shared/info-list"
import { Breadcrumbs } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ProfileTabs } from "@/components/shared/profile-tabs"
import { StudentAttendanceHistory } from "@/components/attendance/student-attendance-history"
import { StudentMemorization } from "@/components/memorization/student-memorization"
import { StudentOverview } from "@/components/students/student-overview"
import { StudentProfileActions } from "@/components/students/student-profile-actions"
import { ageOn, fullName, indexLookups, studentClass } from "@/lib/domain"
import { academicYears, lookups, MOCK_TODAY, students } from "@/lib/mock"

export function generateStaticParams() {
  return students.map((s) => ({ id: s.id }))
}

export async function generateMetadata(props: PageProps<"/admin/students/[id]">): Promise<Metadata> {
  const { id } = await props.params
  const student = students.find((s) => s.id === id)
  return { title: student ? fullName(student) : "ملف الطالب" }
}

export default async function StudentProfilePage(props: PageProps<"/admin/students/[id]">) {
  const { id } = await props.params
  const student = students.find((s) => s.id === id)
  if (!student) notFound()
  // ?tab=memorization|attendance opens a tab directly (links from the memorization overview)
  const { tab } = await props.searchParams
  const initialTab = typeof tab === "string" && ["overview", "attendance", "memorization", "payments", "notes"].includes(tab) ? tab : undefined

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
            <MetaItem icon={CalendarDays}>{ageOn(student.dateOfBirth, MOCK_TODAY)} سنة</MetaItem>
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
            content: <StudentOverview student={student} lookups={lookups} />,
          },
          {
            value: "attendance",
            label: "الحضور",
            icon: <ClipboardCheck aria-hidden />,
            content: (
              <StudentAttendanceHistory studentId={student.id} lookups={lookups} students={students} today={MOCK_TODAY} />
            ),
          },
          {
            value: "memorization",
            label: "متابعة الحفظ",
            icon: <BookOpenCheck aria-hidden />,
            content: (
              <StudentMemorization studentId={student.id} lookups={lookups} students={students}
                academicYears={academicYears} today={MOCK_TODAY} />
            ),
          },
          {
            value: "payments",
            label: "المدفوعات",
            icon: <Wallet aria-hidden />,
            later: true,
            content: (
              <ComingSoon
                icon={Wallet}
                title="الاشتراكات والمدفوعات"
                description="ستُعرض هنا معاليم الاشتراك المدفوعة والمتبقية لهذا الطالب."
              />
            ),
          },
          {
            value: "notes",
            label: "ملاحظات المعلمين",
            icon: <NotebookPen aria-hidden />,
            later: true,
            content: (
              <ComingSoon
                icon={NotebookPen}
                title="ملاحظات المعلمين"
                description="ملاحظات خاصة يدوّنها المعلمون حول سلوك الطالب وتقدّمه، تظهر للإدارة فقط."
              />
            ),
          },
        ]}
      />
    </>
  )
}
