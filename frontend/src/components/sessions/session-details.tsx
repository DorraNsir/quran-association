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
import { errorMessage } from "@/lib/api/errors"
import { useSetSessionStatus, type SessionRosterDto } from "@/lib/api/sessions"
import { weekdayOf } from "@/lib/dates"
import { fullName } from "@/lib/domain"
import { countLabels, formatDate, formatTimeRange } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { workspacePaths, type StaffWorkspace } from "@/lib/workspace"
import type { ISODate } from "@/types/domain"

import { SessionHeader } from "./session-header"
import type { SessionRow } from "./use-session-rows"

/**
 * One dated session. In the teacher workspace the management actions
 * (complete / cancel / reschedule) are hidden: teachers only take attendance.
 */
export function SessionDetails({
  row,
  roster,
  today,
  workspace = "admin",
}: {
  row: SessionRow
  roster: SessionRosterDto
  today: ISODate
  workspace?: StaffWorkspace
}) {
  const { session, group, progress } = row
  const paths = workspacePaths(workspace)
  const canManage = workspace === "admin"
  const setStatus = useSetSessionStatus(session.id)
  const [dialog, setDialog] = useState<"cancel" | "complete" | null>(null)
  const [reason, setReason] = useState("")
  // The server decides (cancelled, future, teacher correction window)
  const editable = roster.editable
  // Expected students, plus anyone recorded who has since left the class
  const students = roster.students.filter((s) => s.expected || s.recorded)
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
      onSelect: () =>
        setStatus.mutate(
          { status: "SCHEDULED" },
          {
            onSuccess: () => toast.success("أُعيدت برمجة الحصة"),
            onError: (error) => toast.error(errorMessage(error)),
          }
        ),
    })
  }

  return (
    <>
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "الحصص", href: paths.sessions }, { label: `${group?.name ?? ""} (${row.branch?.name ?? ""}) — ${formatDate(session.date)}` }]}
      />
      <SessionHeader
        row={row}
        actions={
          <>
            {editable && (
              <Button asChild>
                <Link href={paths.attendance(session.id)}>
                  <ClipboardCheck />
                  {roster.recordedCount > 0 ? "تعديل الحضور" : "تسجيل الحضور"}
                </Link>
              </Button>
            )}
            {canManage && <ActionsMenu label="إجراءات الحصة" triggerVariant="outline" actions={secondary} />}
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
                  {students.map((student) => (
                    <li key={student.studentId} className="flex items-center justify-between gap-3 py-2.5">
                      <Link href={paths.student(student.studentId)} className="min-w-0 hover:opacity-80">
                        <PersonCell name={fullName(student)} photoUrl={student.photoUrl ?? undefined} size="sm" secondary={student.note ?? undefined} />
                      </Link>
                      {student.status ? (
                        <AttendanceStatusBadge status={student.status} />
                      ) : (
                        <span className="text-xs text-warning">لم يُسجَّل</span>
                      )}
                    </li>
                  ))}
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
                  value: group && row.groupClass && (
                    <Link href={paths.groupClass(row.groupClass)} className="text-primary hover:underline">
                      {group.name}
                    </Link>
                  ),
                  icon: BookOpen,
                },
                {
                  label: "القسم",
                  value: `${row.branch?.name ?? ""} · ${row.room?.name ?? ""}`,
                  icon: Users,
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
                { label: "عدد الطلبة", value: countLabels.students(roster.expectedCount), icon: Users },
              ]}
            />
          </SectionCard>

          <SectionCard title="فريق الحصة" icon={UsersRound}>
            <ul className="space-y-3">
              {team.map(({ teacher, role }) => (
                <li key={teacher.id} className="flex items-center justify-between gap-2">
                  <PersonCell name={fullName(teacher)} size="sm" />
                  <TeacherRoleBadge role={role} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">الفريق كما كان عند برمجة الحصة. حضور المعلمين لا يُسجَّل في المنصة حاليًا.</p>
          </SectionCard>
        </div>
      </div>

      <Dialog open={dialog === "cancel"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إلغاء حصة {formatDate(session.date)}؟</DialogTitle>
            <DialogDescription>
              يُلغى هذا التاريخ فقط لقسم {row.branch?.name} من {group?.name}. البرنامج الأسبوعي وبقية الحصص والأقسام الأخرى لا تتغيّر.
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
          {setStatus.isError && dialog === "cancel" && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage(setStatus.error)}</p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={setStatus.isPending} onClick={() => setDialog(null)}>
              {labels.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate(
                  { status: "CANCELLED", cancellationReason: reason.trim() || undefined },
                  {
                    onSuccess: () => {
                      setDialog(null)
                      toast.success(`أُلغيت حصة ${formatDate(session.date)}`)
                    },
                  }
                )
              }
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
            ? `انتبه: ${countLabels.students(progress.expected - progress.recorded)} دون تسجيل حضور. يُفضّل إكمال الحضور أولًا. سيُسجَّل هذا الإجراء كقرار إداري.`
            : "الحضور مسجَّل لكل الطلبة."
        }
        confirmLabel="تأكيد"
        onConfirm={async () => {
          await setStatus.mutateAsync({ status: "COMPLETED", adminOverride: true })
          setDialog(null)
          toast.success("سُجّلت الحصة كمنجزة")
        }}
      />
    </>
  )
}
