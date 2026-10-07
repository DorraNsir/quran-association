import {
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  DoorOpen,
  LayoutGrid,
  MapPin,
  NotebookPen,
  Phone,
  ShieldCheck,
  UserPlus,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { StudentAttendanceHistory } from "@/components/attendance/student-attendance-history"
import { StudentMemorization } from "@/components/memorization/student-memorization"
import { StatusBadge } from "@/components/shared/badges"
import { InfoList, PhoneLink, SectionCard } from "@/components/shared/info-list"
import { NoAccess } from "@/components/shared/no-access"
import { Breadcrumbs } from "@/components/shared/page-header"
import { MetaItem, ProfileHeader } from "@/components/shared/profile"
import { ProfileTabs } from "@/components/shared/profile-tabs"
import { TeacherNotes } from "@/components/teacher/teacher-notes"
import { getCurrentTeacher } from "@/lib/auth/current-user"
import { ageOn, fullName, indexLookups, studentClass } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { lookups, MOCK_TODAY, students } from "@/lib/mock"
import { canTeacherAccessStudent, getTeacherGroupClasses, getTeacherStudents } from "@/lib/teacher-access"

const TABS = ["overview", "attendance", "memorization", "notes"]

export async function generateMetadata(props: PageProps<"/teacher/students/[id]">): Promise<Metadata> {
  const { id } = await props.params
  const student = students.find((s) => s.id === id)
  return { title: student ? fullName(student) : "ملف الطالب" }
}

export default async function TeacherStudentPage(props: PageProps<"/teacher/students/[id]">) {
  const { id } = await props.params
  const student = students.find((s) => s.id === id)
  if (!student) notFound()
  const { teacherId } = await getCurrentTeacher()
  // Only students of the teacher's own classes (resolved via GroupClass, never Group)
  if (!canTeacherAccessStudent(teacherId, student, lookups)) {
    return <NoAccess backHref="/teacher/students" backLabel="العودة إلى طلابي" />
  }
  const { tab } = await props.searchParams
  const initialTab = typeof tab === "string" && TABS.includes(tab) ? tab : undefined

  const myStudents = getTeacherStudents(teacherId, lookups, students)
  const myClassIds = getTeacherGroupClasses(teacherId, lookups).map((a) => a.groupClass.id)
  const view = studentClass(student, indexLookups(lookups))
  const name = fullName(student)

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "طلابي", href: "/teacher/students" }, { label: name }]} />
      <ProfileHeader
        name={name}
        photoUrl={student.photoUrl}
        badges={student.status !== "ACTIVE" && <StatusBadge status={student.status} />}
        meta={
          <>
            {view && (
              <MetaItem icon={BookOpen}>
                <Link href={`/teacher/classes/${view.groupClass.id}`} className="hover:text-primary">
                  {view.group?.name} — {view.branch?.name}
                </Link>
              </MetaItem>
            )}
            <MetaItem icon={CalendarDays}>{ageOn(student.dateOfBirth, MOCK_TODAY)} سنة</MetaItem>
          </>
        }
      />
      <ProfileTabs
        defaultValue={initialTab}
        tabs={[
          {
            value: "overview",
            label: "نظرة عامة",
            icon: <LayoutGrid aria-hidden />,
            content: (
              <SectionCard title="المعلومات" icon={LayoutGrid}>
                <InfoList
                  items={[
                    { label: "المجموعة", value: view?.group?.name, icon: BookOpen },
                    { label: "الفرع", value: view?.branch?.name, icon: MapPin },
                    { label: "القاعة", value: view?.room?.name, icon: DoorOpen },
                    { label: "المدرس المشرف", value: view?.supervisor && fullName(view.supervisor), icon: ShieldCheck },
                    ...(student.phone ? [{ label: "هاتف الطالب", value: <PhoneLink phone={student.phone} />, icon: Phone }] : []),
                    { label: "هاتف الولي", value: student.guardianPhone && <PhoneLink phone={student.guardianPhone} />, icon: Phone },
                    { label: "تاريخ التسجيل", value: formatDate(student.registrationDate), icon: UserPlus },
                  ]}
                />
              </SectionCard>
            ),
          },
          {
            value: "attendance",
            label: "الحضور",
            icon: <ClipboardCheck aria-hidden />,
            content: (
              <StudentAttendanceHistory studentId={student.id} lookups={lookups} students={myStudents} today={MOCK_TODAY}
                workspace="teacher" groupClassIds={myClassIds} />
            ),
          },
          {
            value: "memorization",
            label: "متابعة الحفظ",
            icon: <BookOpenCheck aria-hidden />,
            content: (
              <StudentMemorization studentId={student.id} lookups={lookups} students={myStudents} today={MOCK_TODAY} updaterId={teacherId} />
            ),
          },
          {
            value: "notes",
            label: "ملاحظاتي",
            icon: <NotebookPen aria-hidden />,
            content: <TeacherNotes teacherId={teacherId} lookups={lookups} students={myStudents} today={MOCK_TODAY} studentId={student.id} />,
          },
        ]}
      />
    </>
  )
}
