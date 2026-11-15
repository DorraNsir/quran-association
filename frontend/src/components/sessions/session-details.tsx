"use client"

import {
  BookOpen,
  CalendarCheck2,
  CalendarX2,
  ClipboardCheck,
  ClipboardList,
  Info,
  Pencil,
  Repeat,
  RotateCcw,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { TimeRange } from "@/components/shared/time-range"
import { PersonCell } from "@/components/shared/user-avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api/errors"
import { useQueryClient } from "@tanstack/react-query"

import { useAttendanceOpen } from "@/hooks/use-attendance-open"
import { rosterKey, useSetSessionStatus, type SessionDto, type SessionRosterDto } from "@/lib/api/sessions"
import { useTeacherWorkspace } from "@/lib/api/workspace"
import { weekdayOf } from "@/lib/dates"
import { fullName } from "@/lib/domain"
import { countLabels, formatDate, formatShortDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { attendanceOpensLabel, canAdminCancel, canDeleteExtra, canEditExtra, canTeacherCancel } from "@/lib/session-actions"
import { workspacePaths, type StaffWorkspace } from "@/lib/workspace"
import type { ISODate } from "@/types/domain"

import { CancelSessionDialog } from "./cancel-session-dialog"
import { DeleteExtraSessionDialog, EditExtraSessionSheet } from "./extra-session-actions"
import { SessionHeader } from "./session-header"
import { SessionMemorizationPanel } from "./session-memorization"
import type { SessionRow } from "./use-session-rows"

/**
 * «إلغاء الحصة» for the SUPERVISOR of the lesson (team snapshot) in the
 * teacher workspace — an upcoming lesson without attendance. The API checks
 * all of it again; assistants never get the action.
 */
function TeacherSessionMenu({ row, recorded, onCancel }: { row: SessionRow; recorded: number; onCancel: () => void }) {
  const me = useTeacherWorkspace().data?.teacher.id
  const isSupervisor = Boolean(me) && row.supervisor?.id === me
  if (!canTeacherCancel(row.session, recorded, isSupervisor)) return null
  return (
    <ActionsMenu
      label="إجراءات الحصة"
      triggerVariant="outline"
      actions={[{ label: "إلغاء الحصة", icon: CalendarX2, destructive: true, onSelect: onCancel }]}
    />
  )
}

/**
 * One dated session. Admin: complete / cancel / restore, and for an extra
 * lesson «تعديل الحصة» and «حذف نهائي». Teacher: attendance, and — for the
 * lesson's supervisor only — «إلغاء الحصة».
 */
export function SessionDetails({
  row,
  roster,
  today,
  workspace = "admin",
  dto,
}: {
  row: SessionRow
  roster: SessionRosterDto
  today: ISODate
  workspace?: StaffWorkspace
  /** The API session (the edit form needs its room, classes and updatedAt) */
  dto?: SessionDto
}) {
  const { session, group, progress } = row
  const paths = workspacePaths(workspace)
  const router = useRouter()
  const canManage = workspace === "admin"
  const setStatus = useSetSessionStatus(session.id)
  const [dialog, setDialog] = useState<"cancel" | "complete" | "edit" | "delete" | null>(null)
  // The server decides (cancelled, not started yet); the teacher correction window only locks saved values
  const editable = roster.editable
  // Before the start: the action shown disabled with its time; at the start the roster is refreshed (no page reload)
  const queryClient = useQueryClient()
  const { open: started, now } = useAttendanceOpen(session, () =>
    queryClient.invalidateQueries({ queryKey: rosterKey(session.id) })
  )
  const waitsForStart = !editable && !started && session.status !== "CANCELLED"
  // Expected students, plus anyone recorded who has since left the class
  const students = roster.students.filter((s) => s.expected || s.recorded)
  const team = [
    ...(row.supervisor ? [{ teacher: row.supervisor, role: "SUPERVISOR" as const }] : []),
    ...row.assistants.map((teacher) => ({ teacher, role: "ASSISTANT" as const })),
  ]

  // Any recorded attendance (students or teachers) means the lesson took place
  const recorded = roster.recordedCount + roster.teacherRecordedCount
  const secondary: RowAction[] = []
  if (session.status === "SCHEDULED" && session.date <= today) {
    secondary.push({ label: "اعتبار الحصة منجزة", icon: CalendarCheck2, onSelect: () => setDialog("complete") })
  }
  // An extra lesson not started yet: its date, time, room or shared classes
  if (dto && canEditExtra(session, recorded)) {
    secondary.push({ label: "تعديل الحصة", icon: Pencil, onSelect: () => setDialog("edit") })
  }
  if (session.status !== "CANCELLED") {
    // Only a scheduled lesson without attendance (the API refuses the others)
    if (canAdminCancel(session, recorded))
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
  // «حذف نهائي»: an extra lesson without attendance, cancelled or not started yet
  if (canDeleteExtra(session, recorded)) {
    secondary.push({ label: "حذف نهائي", icon: Trash2, destructive: true, separated: true, onSelect: () => setDialog("delete") })
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
            {waitsForStart && (
              <span className="inline-flex flex-col items-start gap-1">
                <Button disabled aria-describedby="attendance-opens">
                  <ClipboardCheck />
                  تسجيل الحضور
                </Button>
                <span id="attendance-opens" className="text-xs text-muted-foreground">
                  {attendanceOpensLabel(session, formatShortDate, now)}
                </span>
              </span>
            )}
            {canManage && secondary.length > 0 && <ActionsMenu label="إجراءات الحصة" triggerVariant="outline" actions={secondary} />}
            {workspace === "teacher" && (
              <TeacherSessionMenu row={row} recorded={recorded} onCancel={() => setDialog("cancel")} />
            )}
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
                      <div className="flex min-w-0 items-center gap-2">
                        <Link href={paths.student(student.studentId)} className="min-w-0 hover:opacity-80">
                          <PersonCell name={fullName(student)} photoUrl={student.photoUrl ?? undefined} size="sm" secondary={student.note ?? undefined} />
                        </Link>
                        {/* «حصة مشتركة»: each student keeps their own program */}
                        {row.shared && student.groupClass && <Badge variant="outline">{student.groupClass.group.name}</Badge>}
                      </div>
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
          {row.shared && <SessionMemorizationPanel row={row} workspace={workspace} />}
        </div>

        <div className="space-y-6">
          <SectionCard title="الحصة" icon={BookOpen}>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                row.shared
                  ? {
                      label: "حصة مشتركة",
                      value: (
                        <ul className="space-y-0.5">
                          {row.classes.map((c, i) => (
                            <li key={c.id}>
                              <Link
                                href={paths.groupClass({ id: c.id, groupId: c.group.id })}
                                className="text-primary hover:underline"
                              >
                                {c.group.name}
                              </Link>
                              {i === 0 && <span className="ms-1 text-xs text-muted-foreground">(القسم الأساسي)</span>}
                            </li>
                          ))}
                        </ul>
                      ),
                      icon: BookOpen,
                    }
                  : {
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
                      <TimeRange start={session.start} end={session.end} />
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

      <CancelSessionDialog row={row} workspace={workspace} open={dialog === "cancel"} onOpenChange={(open) => !open && setDialog(null)} />

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

      {canManage && dto && dialog === "edit" && (
        <EditExtraSessionSheet session={dto} open onOpenChange={(open) => !open && setDialog(null)} />
      )}
      {canManage && (
        <DeleteExtraSessionDialog
          session={{ id: session.id, date: session.date }}
          open={dialog === "delete"}
          onOpenChange={(open) => !open && setDialog(null)}
          onDeleted={() => router.push(paths.sessions)}
        />
      )}
    </>
  )
}
