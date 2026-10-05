"use client"

import {
  BookOpen,
  CalendarCheck2,
  CalendarX2,
  ClipboardCheck,
  ClipboardList,
  Info,
  Repeat,
  RotateCcw,
  Users,
  UsersRound,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { AttendanceStateLabel, AttendanceStatusBadge } from "@/components/attendance/attendance-badges"
import { AttendanceProgress, AttendanceStats } from "@/components/attendance/attendance-stats"
import { ActionsMenu, type RowAction } from "@/components/shared/actions-menu"
import { TeacherRoleBadge } from "@/components/shared/badges"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { InfoList, SectionCard } from "@/components/shared/info-list"
import { Breadcrumbs } from "@/components/shared/page-header"
import { PersonCell } from "@/components/shared/user-avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { canTakeAttendance } from "@/lib/attendance"
import { weekdayOf } from "@/lib/dates"
import { fullName } from "@/lib/domain"
import { countLabels, formatDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { operations } from "@/lib/store/operations"
import type { ISODate } from "@/types/domain"

import { SessionHeader } from "./session-header"
import type { SessionRow } from "./use-session-rows"

const mockSaved = { description: labels.common.mockNotice }

export function SessionDetails({ row, today }: { row: SessionRow; today: ISODate }) {
  const { session, group, roster, progress } = row
  const [dialog, setDialog] = useState<"cancel" | "complete" | null>(null)
  const [reason, setReason] = useState("")
  const editable = canTakeAttendance(session, today)
  const recordsByStudent = new Map(row.records.map((r) => [r.studentId, r]))
  const teacherRecords = new Map(row.teacherRecords.map((r) => [r.teacherId, r]))
  const team = [
    ...(row.supervisor ? [{ teacher: row.supervisor, role: "SUPERVISOR" as const }] : []),
    ...row.assistants.map((teacher) => ({ teacher, role: "ASSISTANT" as const })),
  ]

  const secondary: RowAction[] = []
  if (session.status === "SCHEDULED" && session.date <= today) {
    secondary.push({ label: "اعتبار الحصة منجزة", icon: CalendarCheck2, onSelect: () => setDialog("complete") })
  }
  if (session.status !== "CANCELLED") {
    secondary.push({ label: "إلغاء هذه الحصة", icon: CalendarX2, destructive: true, separated: secondary.length > 0, onSelect: () => setDialog("cancel") })
  } else {
    secondary.push({
      label: "إعادة برمجة الحصة",
      icon: RotateCcw,
      onSelect: () => {
        operations.setSessionStatus(session.id, "SCHEDULED")
        toast.success("أُعيدت برمجة الحصة", mockSaved)
      },
    })
  }

  return (
    <>
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "الحصص", href: "/admin/sessions" }, { label: `${group?.name ?? ""} — ${formatDate(session.date)}` }]}
      />
      <SessionHeader
        row={row}
        actions={
          <>
            {editable && (
              <Button asChild>
                <Link href={`/admin/sessions/${session.id}/attendance`}>
                  <ClipboardCheck />
                  {row.records.length > 0 ? "تعديل الحضور" : "تسجيل الحضور"}
                </Link>
              </Button>
            )}
            <ActionsMenu label="إجراءات الحصة" triggerVariant="outline" actions={secondary} />
          </>
        }
      />

      {session.status === "CANCELLED" && (
        <Alert className="mb-6 border-destructive/30 bg-destructive/5">
          <CalendarX2 className="text-destructive" />
          <AlertTitle className="text-destructive">ألغيت هذه الحصة فقط</AlertTitle>
          <AlertDescription>
            {session.cancellationReason && <p>السبب: {session.cancellationReason}</p>}
            <p>
              البرنامج الأسبوعي للمجموعة لم يتغيّر: بقية حصص كل {labels.weekday[weekdayOf(session.date)]} تبقى مبرمجة.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="حضور الطلبة"
            icon={ClipboardList}
            action={<AttendanceStateLabel {...progress} />}
          >
            {progress.state === "CANCELLED" || progress.state === "UPCOMING" ? (
              <EmptyState
                icon={progress.state === "CANCELLED" ? CalendarX2 : Info}
                title={progress.state === "CANCELLED" ? "لا حضور لحصة ملغاة" : "لم يتم تسجيل الحضور بعد"}
                description={progress.state === "UPCOMING" ? "يُسجَّل الحضور يوم الحصة." : undefined}
                className="py-6"
              />
            ) : (
              <div className="space-y-5">
                <AttendanceProgress recorded={progress.recorded} expected={progress.expected} />
                <AttendanceStats summary={row.summary} className="lg:grid-cols-5" />
                <ul className="divide-y">
                  {roster.map((student) => {
                    const record = recordsByStudent.get(student.id)
                    return (
                      <li key={student.id} className="flex items-center justify-between gap-3 py-2.5">
                        <Link href={`/admin/students/${student.id}`} className="min-w-0 hover:opacity-80">
                          <PersonCell name={fullName(student)} photoUrl={student.photoUrl} size="sm" secondary={record?.note} />
                        </Link>
                        {record ? (
                          <AttendanceStatusBadge status={record.status} />
                        ) : (
                          <span className="text-xs text-warning">لم يُسجَّل</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="الحصة" icon={BookOpen}>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                {
                  label: "المجموعة",
                  value: group && (
                    <Link href={`/admin/groups/${group.id}`} className="text-primary hover:underline">
                      {group.name}
                    </Link>
                  ),
                  icon: BookOpen,
                },
                {
                  label: "من البرنامج الأسبوعي",
                  value: (
                    <>
                      كل {labels.weekday[weekdayOf(session.date)]}{" "}
                      <span dir="ltr" className="tabular-nums">{formatTimeRange(session.start, session.end)}</span>
                    </>
                  ),
                  icon: Repeat,
                },
                { label: "عدد الطلبة", value: countLabels.students(roster.length), icon: Users },
              ]}
            />
          </SectionCard>

          <SectionCard title="حضور المعلمين" icon={UsersRound}>
            <ul className="space-y-3">
              {team.map(({ teacher, role }) => {
                const record = teacherRecords.get(teacher.id)
                return (
                  <li key={teacher.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <PersonCell name={fullName(teacher)} size="sm" />
                      {record ? (
                        <AttendanceStatusBadge status={record.status} />
                      ) : (
                        <span className="text-xs text-muted-foreground">لم يُسجَّل</span>
                      )}
                    </div>
                    <TeacherRoleBadge role={role} className="ms-10" />
                  </li>
                )
              })}
            </ul>
          </SectionCard>
        </div>
      </div>

      <Dialog open={dialog === "cancel"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء حصة {formatDate(session.date)}؟</DialogTitle>
            <DialogDescription>
              يُلغى هذا التاريخ فقط. البرنامج الأسبوعي لـ{group?.name} وبقية الحصص لا تتغيّر.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">سبب الإلغاء (اختياري)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: عطلة، غياب المعلم، نشاط بالجمعية…"
              maxLength={160}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {labels.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                operations.setSessionStatus(session.id, "CANCELLED", reason)
                setDialog(null)
                toast.success(`أُلغيت حصة ${formatDate(session.date)}`, mockSaved)
              }}
            >
              <CalendarX2 />
              إلغاء الحصة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog === "complete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="اعتبار الحصة منجزة؟"
        description={
          progress.recorded < progress.expected
            ? `انتبه: ${countLabels.students(progress.expected - progress.recorded)} دون تسجيل حضور. يُفضّل إكمال الحضور أولًا.`
            : "الحضور مسجَّل لكل الطلبة."
        }
        confirmLabel="تأكيد"
        onConfirm={() => {
          operations.setSessionStatus(session.id, "COMPLETED")
          toast.success("سُجّلت الحصة كمنجزة", mockSaved)
        }}
      />
    </>
  )
}
