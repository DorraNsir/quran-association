import {
  BookOpen,
  CalendarDays,
  Clock,
  Contact,
  Hash,
  IdCard,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react"
import Link from "next/link"

import { StatusBadge, TeacherRoleBadge } from "@/components/shared/badges"
import { InfoList, PhoneLink, SectionCard } from "@/components/shared/info-list"
import { ScheduleSummary } from "@/components/shared/schedule"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import {
  ageOn,
  fullName,
  indexLookups,
  schedulesOf,
  studentClass,
  type Lookups,
} from "@/lib/domain"
import { formatDate, formatElapsed } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { todayInTunis } from "@/lib/dates"
import type { Student } from "@/types/domain"

export function StudentOverview({ student, lookups }: { student: Student; lookups: Lookups }) {
  // Student → class → group, place, teachers: the supervisor is the CLASS's, not the group's
  const cls = studentClass(student, indexLookups(lookups))
  const group = cls?.group
  const age = ageOn(student.dateOfBirth, todayInTunis())

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <SectionCard title="المعلومات الشخصية" icon={UserRound}>
          <InfoList
            items={[
              { label: "الاسم واللقب", value: fullName(student), icon: UserRound },
              {
                label: "تاريخ الولادة",
                value: `${formatDate(student.dateOfBirth)} (${age} سنة)`,
                icon: CalendarDays,
              },
              { label: "الجنس", value: labels.gender[student.gender], icon: Users },
              {
                label: "رقم بطاقة التعريف",
                value: student.cin && <span dir="ltr" className="tabular-nums">{student.cin}</span>,
                icon: IdCard,
              },
            ]}
          />
        </SectionCard>

        <SectionCard title="معلومات التواصل" icon={Contact}>
          <InfoList
            items={[
              {
                label: "هاتف الطالب",
                value: student.phone && <PhoneLink phone={student.phone} />,
                icon: Phone,
              },
              {
                label: age < 18 ? "هاتف الولي (للتواصل)" : "هاتف الولي",
                value: student.guardianPhone && <PhoneLink phone={student.guardianPhone} />,
                icon: Phone,
              },
              { label: "العنوان", value: student.address, icon: MapPin },
            ]}
          />
        </SectionCard>

        <SectionCard title="معلومات التسجيل" icon={Hash}>
          <InfoList
            items={[
              { label: "تاريخ التسجيل", value: formatDate(student.registrationDate), icon: CalendarDays },
              {
                label: "مدة الانخراط",
                value: formatElapsed(student.registrationDate, todayInTunis()),
                icon: Clock,
              },
              { label: "حالة الملف", value: <StatusBadge status={student.status} /> },
              {
                label: "رقم الملف",
                value: <span dir="ltr" className="tabular-nums">{student.id.toUpperCase()}</span>,
              },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard
        title="المجموعة والحلقة"
        icon={BookOpen}
        className="order-first h-fit lg:order-none"
        action={
          group && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/admin/groups/${group.id}`}>عرض المجموعة</Link>
            </Button>
          )
        }
      >
        {cls && group ? (
          <div className="space-y-5">
            <div>
              <p className="text-lg font-semibold">{group.name}</p>
              <p className="text-sm text-muted-foreground">{group.audience}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden />
                    الفرع
                  </dt>
                  <dd className="font-medium">{cls.branch?.name}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" aria-hidden />
                    القاعة
                  </dt>
                  <dd className="font-medium">{cls.room?.name}</dd>
                </div>
              </dl>
            </div>
            <div className="space-y-3 border-t pt-4">
              {cls.supervisor && (
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/teachers/${cls.supervisor.id}`} className="min-w-0 hover:opacity-80">
                    <PersonCell name={fullName(cls.supervisor)} size="sm" />
                  </Link>
                  <TeacherRoleBadge role="SUPERVISOR" />
                </div>
              )}
              {cls.assistants.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2">
                  <PersonCell name={fullName(t)} size="sm" />
                  <TeacherRoleBadge role="ASSISTANT" />
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t pt-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="size-3.5" aria-hidden />
                مواعيد الحصص
              </p>
              <ScheduleSummary schedule={schedulesOf(cls.groupClass.id, lookups.schedules)} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">لم يُعيَّن الطالب في مجموعة.</p>
        )}
      </SectionCard>
    </div>
  )
}
