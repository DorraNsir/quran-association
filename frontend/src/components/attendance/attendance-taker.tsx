"use client"

import { useQueryClient } from "@tanstack/react-query"
import { CalendarX2, CheckCheck, Loader2, Lock, RefreshCw, Save, SearchX, TriangleAlert, UsersRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { SessionHeader } from "@/components/sessions/session-header"
import type { SessionRow } from "@/components/sessions/use-session-rows"
import { TeacherRoleBadge } from "@/components/shared/badges"
import { EmptyState } from "@/components/shared/empty-state"
import { matchesText, SearchInput } from "@/components/shared/filters"
import { Breadcrumbs } from "@/components/shared/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { AttendanceEntry } from "@/lib/attendance"
import { ApiError, errorMessage } from "@/lib/api/errors"
import { todayInTunis } from "@/lib/dates"
import { rosterKey, useSaveAttendance, type SaveAttendanceBody, type SessionRosterDto } from "@/lib/api/sessions"
import { fullName } from "@/lib/domain"
import { countLabels, formatDate } from "@/lib/format"
import { workspacePaths, type StaffWorkspace } from "@/lib/workspace"
import type { AttendanceStatus, ID } from "@/types/domain"

import { AttendanceHistoryButton } from "./attendance-history-sheet"
import { StudentAttendanceRow } from "./attendance-rows"
import { AttendanceProgress } from "./attendance-stats"

type Draft = Map<ID, AttendanceEntry>

const savedDraft = (rows: { id: ID; status: AttendanceStatus | null; note: string | null }[]): Draft =>
  new Map(rows.filter((r) => r.status).map((r) => [r.id, { status: r.status!, note: r.note ?? undefined }]))

/**
 * What the user changed compared with what the page loaded — the only rows
 * sent, each with the loaded status so the API can refuse (409) a record
 * someone else changed meanwhile instead of silently overwriting it.
 */
function changesOf(draft: Draft, saved: Draft) {
  const out: { id: ID; status: AttendanceStatus; note: string | null; expectedStatus: AttendanceStatus | null }[] = []
  for (const [id, entry] of draft) {
    const before = saved.get(id)
    const note = entry.note?.trim() || null
    if (before && before.status === entry.status && (before.note?.trim() || null) === note) continue
    out.push({ id, status: entry.status, note, expectedStatus: before ? before.status : null })
  }
  return out
}

/**
 * The session's attendance, same page for the admin and the session's team
 * (the API decides who may read / write): teachers first, then students,
 * one save for both. Fast taking: mark everyone present, change the
 * exceptions, save. The student roster is the API's (enrolled and active ON
 * the session date) and the teachers are the session's team snapshot; the
 * session becomes completed on the server once every expected student is
 * recorded. Saving one section never touches the other. Remount (key) after
 * a save so the draft starts from saved data.
 */
export function AttendanceTaker({ row, roster: saved, workspace = "admin" }: { row: SessionRow; roster: SessionRosterDto; workspace?: StaffWorkspace }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const paths = workspacePaths(workspace)
  const { session, group } = row
  const save = useSaveAttendance(workspace, session.id)
  // Expected students, plus anyone already recorded who has since left the class
  const roster = saved.students
    .filter((s) => s.expected || s.recorded)
    .map((s) => ({ id: s.studentId, firstName: s.firstName, lastName: s.lastName, photoUrl: s.photoUrl ?? undefined, expected: s.expected }))
  const team = saved.teachers.map((t) => ({
    id: t.teacherId,
    firstName: t.firstName,
    lastName: t.lastName,
    photoUrl: t.photoUrl ?? undefined,
    role: t.role,
  }))
  const [savedStudents] = useState(() => savedDraft(saved.students.map((s) => ({ id: s.studentId, status: s.status, note: s.note }))))
  const [savedTeachers] = useState(() => savedDraft(saved.teachers.map((t) => ({ id: t.teacherId, status: t.status, note: t.note }))))
  const [students, setStudents] = useState<Draft>(() => new Map(savedStudents))
  const [teachers, setTeachers] = useState<Draft>(() => new Map(savedTeachers))
  const [query, setQuery] = useState("")
  const [onlyUnmarked, setOnlyUnmarked] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)

  const editable = saved.editable
  const isEdit = saved.recordedCount > 0 || saved.teacherRecordedCount > 0
  const unmarked = roster.filter((s) => s.expected && !students.has(s.id))
  const expectedCount = roster.filter((s) => s.expected).length
  const teacherRecorded = team.filter((t) => teachers.has(t.id)).length
  const studentChanges = changesOf(students, savedStudents)
  const teacherChanges = changesOf(teachers, savedTeachers)
  const dirty = studentChanges.length + teacherChanges.length > 0
  const visible = roster.filter(
    (s) => (!query.trim() || matchesText(fullName(s), query)) && (!onlyUnmarked || !students.has(s.id))
  )

  const updater = (set: React.Dispatch<React.SetStateAction<Draft>>) => (id: ID, fn: (prev?: AttendanceEntry) => AttendanceEntry) =>
    set((prev) => new Map(prev).set(id, fn(prev.get(id))))
  const updateStudent = updater(setStudents)
  const updateTeacher = updater(setTeachers)

  /** Never overwrites a status already chosen — it only fills the gaps. */
  function markRemainingPresent() {
    setStudents((prev) => {
      const next = new Map(prev)
      for (const s of roster) if (s.expected && !next.has(s.id)) next.set(s.id, { status: "PRESENT" })
      return next
    })
  }

  function submit() {
    if (save.isPending || !dirty) return
    const body: SaveAttendanceBody = {}
    if (studentChanges.length > 0) body.records = studentChanges.map(({ id, ...r }) => ({ studentId: id, ...r }))
    if (teacherChanges.length > 0) body.teachers = teacherChanges.map(({ id, ...r }) => ({ teacherId: id, ...r }))
    // mutateAsync, not mutate(…, callbacks): the save refetches the roster,
    // which remounts this page — per-call callbacks of an unmounted observer never run
    save.mutateAsync(body).then(
      (result) => {
        setConfirmOpen(false)
        setConflict(null)
        if (!body.records) {
          toast.success("تم حفظ حضور المعلمين")
        } else if (result.complete) {
          toast.success("تم حفظ الحضور بنجاح")
          router.push(paths.session(session.id))
        } else {
          toast.warning(`حُفظ تسجيل جزئي — ${countLabels.students(result.expectedCount - result.recordedCount)} دون تسجيل`, {
            description: "تبقى الحصة في قائمة الحضور غير المكتمل.",
          })
        }
      },
      (error: unknown) => {
        setConfirmOpen(false)
        if (error instanceof ApiError && error.code === "ATTENDANCE_CHANGED") setConflict(error.message)
        else toast.error(errorMessage(error))
      }
    )
  }

  // Reloading replaces the draft with the latest saved values (the page remounts)
  const reload = () => queryClient.invalidateQueries({ queryKey: rosterKey(session.id) })

  const crumbs = [
    { label: "الحصص", href: paths.sessions },
    { label: `${group?.name ?? ""} (${row.branch?.name ?? ""}) — ${formatDate(session.date)}`, href: paths.session(session.id) },
    { label: isEdit ? "تعديل الحضور" : "تسجيل الحضور" },
  ]

  return (
    <>
      <Breadcrumbs className="mb-4" items={crumbs} />
      <SessionHeader row={row} />

      {!editable && (
        <Alert className="mb-6">
          {session.status === "CANCELLED" ? <CalendarX2 /> : <Lock />}
          <AlertTitle>
            {session.status === "CANCELLED"
              ? "هذه الحصة ملغاة"
              : session.date > todayInTunis()
                ? "لم يحن موعد هذه الحصة بعد"
                : "انتهت مهلة تسجيل الحضور"}
          </AlertTitle>
          <AlertDescription>
            {session.status === "CANCELLED"
              ? "لا يُسجَّل الحضور في حصة ملغاة."
              : session.date > todayInTunis()
                ? "يمكن تسجيل الحضور يوم الحصة أو بعدها."
                : "انقضت المهلة المسموح بها للمعلمين لتسجيل الحضور أو تعديله. تواصل مع الإدارة."}
          </AlertDescription>
        </Alert>
      )}

      {conflict && (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlert />
          <AlertTitle>تعذّر الحفظ: تغيّر الحضور في الأثناء</AlertTitle>
          <AlertDescription>
            <p>{conflict}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={reload}>
              <RefreshCw />
              تحميل آخر القيم
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="teachers-heading" className="mb-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="teachers-heading" className="text-base font-semibold">
            حضور المعلمين
          </h2>
          <SectionCount label="حضور المعلمين" recorded={teacherRecorded} expected={team.length} />
        </div>
        {team.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState icon={UsersRound} title="لا يوجد معلمون في فريق هذه الحصة" />
          </div>
        ) : (
          <ul className="space-y-2">
            {team.map((teacher) => (
              <StudentAttendanceRow
                key={teacher.id}
                student={teacher}
                entry={teachers.get(teacher.id)}
                disabled={!editable}
                badge={teacher.role ? <TeacherRoleBadge role={teacher.role} /> : <Badge variant="secondary">سابقًا</Badge>}
                onStatus={(status) => updateTeacher(teacher.id, (prev) => ({ ...prev, status }))}
                onNote={(note) => updateTeacher(teacher.id, (prev) => ({ status: prev?.status ?? "PRESENT", note }))}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="students-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="students-heading" className="text-base font-semibold">
            حضور الطلبة <span className="text-sm font-normal text-muted-foreground">({countLabels.students(roster.length)})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <SectionCount label="حضور الطلبة" recorded={expectedCount - unmarked.length} expected={expectedCount} />
            {editable && unmarked.length > 0 && (
              <Button size="lg" onClick={markRemainingPresent}>
                <CheckCheck />
                {students.size === 0 ? "تحديد الجميع حاضر" : `تحديد الباقين حاضرين (${unmarked.length})`}
              </Button>
            )}
          </div>
        </div>

        {roster.length > 6 && (
          <SearchInput value={query} onChange={setQuery} label="البحث عن طالب" placeholder="ابحث عن طالب…" className="sm:max-w-xs" />
        )}
        {editable && unmarked.length > 0 && students.size > 0 && (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={onlyUnmarked} onChange={(e) => setOnlyUnmarked(e.target.checked)} />
            عرض غير المسجَّلين فقط ({unmarked.length})
          </label>
        )}

        {roster.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState icon={UsersRound} title="لا يوجد طلبة في هذه المجموعة" description="أضف طلبة إلى المجموعة لتسجيل حضورهم." />
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState icon={SearchX} title={onlyUnmarked ? "تم تسجيل الجميع" : "لا يوجد طالب بهذا الاسم"} />
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((student) => (
              <StudentAttendanceRow
                key={student.id}
                student={student}
                entry={students.get(student.id)}
                disabled={!editable}
                onStatus={(status) => updateStudent(student.id, (prev) => ({ ...prev, status }))}
                onNote={(note) => updateStudent(student.id, (prev) => ({ status: prev?.status ?? "PRESENT", note }))}
              />
            ))}
          </ul>
        )}
      </section>

      {editable && (roster.length > 0 || team.length > 0) && (
        <div className="sticky bottom-3 z-10 mt-4 flex flex-col gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:gap-6 sm:p-4">
          <AttendanceProgress recorded={expectedCount - unmarked.length} expected={expectedCount} className="flex-1" />
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-warning">تغييرات غير محفوظة</span>}
            <Button
              size="lg"
              className="flex-1 sm:min-w-40 sm:flex-none"
              disabled={save.isPending || !dirty}
              onClick={() => (studentChanges.length > 0 && unmarked.length > 0 ? setConfirmOpen(true) : submit())}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              حفظ الحضور
            </Button>
          </div>
        </div>
      )}

      <section aria-labelledby="history-heading" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <h2 id="history-heading" className="text-base font-semibold">سجل التعديلات</h2>
          <p className="text-sm text-muted-foreground">من سجّل الحضور أو عدّله، ومتى، والحالة قبل التعديل وبعده.</p>
        </div>
        <AttendanceHistoryButton sessionId={session.id} workspace={workspace} />
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حضور الطلبة غير مكتمل</AlertDialogTitle>
            <AlertDialogDescription>
              {countLabels.students(unmarked.length)} دون تسجيل:{" "}
              {unmarked.slice(0, 5).map(fullName).join("، ")}
              {unmarked.length > 5 ? "…" : ""}. يمكن الحفظ الآن كتسجيل جزئي وإكماله لاحقًا، ولن تُعتبر الحصة منجزة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="default">متابعة التسجيل</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              disabled={save.isPending}
              onClick={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              حفظ كتسجيل جزئي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** «حضور المعلمين: 2/3 مسجل» — each section has its own completion. */
function SectionCount({ label, recorded, expected }: { label: string; recorded: number; expected: number }) {
  const done = expected > 0 && recorded >= expected
  return (
    <span className={done ? "text-sm text-primary" : "text-sm text-muted-foreground"}>
      {label}: <span className="tabular-nums" dir="ltr">{recorded}/{expected}</span> مسجل
    </span>
  )
}
