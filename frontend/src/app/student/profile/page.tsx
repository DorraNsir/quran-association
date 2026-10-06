import { BookOpen, CalendarDays, MapPin, Phone, ShieldCheck, UserPlus, UserRound } from "lucide-react"
import type { Metadata } from "next"

import { InfoList, PhoneLink, SectionCard } from "@/components/shared/info-list"
import { ProfileHeader } from "@/components/shared/profile"
import { StudentNotFound } from "@/components/student/student-states"
import { getCurrentStudent } from "@/lib/auth/current-user"
import { ageOn, fullName } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { lookups, MOCK_TODAY } from "@/lib/mock"
import { getStudentGroupClass } from "@/lib/student-access"

export const metadata: Metadata = { title: "الملف الشخصي" }

/** Basic, read-only personal information. No ids, no admin metadata, no teacher notes. */
export default async function StudentProfilePage() {
  const { user, student } = await getCurrentStudent()
  if (!student) return <StudentNotFound />
  const view = getStudentGroupClass(student, lookups)

  return (
    <>
      <ProfileHeader name={fullName(student)} photoUrl={student.photoUrl} meta={<span>{labels.role.STUDENT}</span>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="معلوماتي" icon={UserRound}>
          <InfoList
            items={[
              { label: "الاسم", value: student.firstName, icon: UserRound },
              { label: "اللقب", value: student.lastName, icon: UserRound },
              { label: "تاريخ الولادة", value: `${formatDate(student.dateOfBirth)} (${ageOn(student.dateOfBirth, MOCK_TODAY)} سنة)`, icon: CalendarDays },
              ...(student.phone ? [{ label: "الهاتف", value: <PhoneLink phone={student.phone} />, icon: Phone }] : []),
              { label: "البريد الإلكتروني", value: <span dir="ltr">{user.email}</span>, icon: UserRound },
              { label: "تاريخ التسجيل", value: formatDate(student.registrationDate), icon: UserPlus },
            ]}
          />
        </SectionCard>
        <SectionCard title="دراستي" icon={BookOpen}>
          <InfoList
            className="sm:grid-cols-1"
            items={[
              { label: "المجموعة", value: view?.group?.name ?? "لم يتم إسنادك إلى مجموعة حالياً", icon: BookOpen },
              { label: "الفرع", value: view?.branch?.name, icon: MapPin },
              { label: "المدرس المشرف", value: view?.supervisor && fullName(view.supervisor), icon: ShieldCheck },
            ]}
          />
        </SectionCard>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">لتعديل معلوماتك تواصل مع إدارة الجمعية.</p>
    </>
  )
}
