"use client"

import { CalendarX2, CheckCheck, Loader2, Lock, Save, SearchX, UsersRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { SessionHeader } from "@/components/sessions/session-header"
import type { SessionRow } from "@/components/sessions/use-session-rows"
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
import { Button } from "@/components/ui/button"
import type { AttendanceEntry } from "@/lib/attendance"
import { errorMessage } from "@/lib/api/errors"
import { todayInTunis } from "@/lib/dates"
import { useSaveAttendance, type SessionRosterDto } from "@/lib/api/sessions"
import { fullName } from "@/lib/domain"
import { countLabels, formatDate } from "@/lib/format"
import { workspacePaths, type StaffWorkspace } from "@/lib/workspace"
import type { AttendanceStatus, ID } from "@/types/domain"

import { StudentAttendanceRow } from "./attendance-rows"
import { AttendanceProgress } from "./attendance-stats"

/**
 * Fast attendance taking: mark everyone present, change the exceptions,
 * save. Works as one-tap cards on phones and compact rows on desktop.
 * The roster is the API's (enrolled and active ON the session date); the
 * session becomes completed on the server once every expected student is
 * recorded. Remount (key) after a save so the draft starts from saved data.
 */
export function AttendanceTaker({ row, roster: saved, workspace = "admin" }: { row: SessionRow; roster: SessionRosterDto; workspace?: StaffWorkspace }) {
  const router = useRouter()
  const paths = workspacePaths(workspace)
  const { session, group } = row
  const save = useSaveAttendance(workspace, session.id)
  // Expected students, plus anyone already recorded who has since left the class
  const roster = saved.students
    .filter((s) => s.expected || s.recorded)
    .map((s) => ({ id: s.studentId, firstName: s.firstName, lastName: s.lastName, photoUrl: s.photoUrl ?? undefined, expected: s.expected }))
  const [students, setStudents] = useState(
    () =>
      new Map<ID, AttendanceEntry>(
        saved.students.filter((s) => s.status).map((s) => [s.studentId, { status: s.status!, note: s.note ?? undefined }])
      )
  )
  const [query, setQuery] = useState("")
  const [onlyUnmarked, setOnlyUnmarked] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dirty, setDirty] = useState(false)

  const editable = saved.editable
  const isEdit = saved.recordedCount > 0
  const unmarked = roster.filter((s) => s.expected && !students.has(s.id))
  const expectedCount = roster.filter((s) => s.expected).length
  const visible = roster.filter(
    (s) => (!query.trim() || matchesText(fullName(s), query)) && (!onlyUnmarked || !students.has(s.id))
  )

  function update(id: ID, fn: (prev?: AttendanceEntry) => AttendanceEntry) {
    setStudents((prev) => new Map(prev).set(id, fn(prev.get(id))))
    setDirty(true)
  }
  const setStatus = (id: ID, status: AttendanceStatus) => update(id, (prev) => ({ ...prev, status }))
  const setNote = (id: ID, note: string) => update(id, (prev) => ({ status: prev?.status ?? "PRESENT", note }))

  /** Never overwrites a status already chosen — it only fills the gaps. */
  function markRemainingPresent() {
    setStudents((prev) => {
      const next = new Map(prev)
      for (const s of roster) if (s.expected && !next.has(s.id)) next.set(s.id, { status: "PRESENT" })
      return next
    })
    setDirty(true)
  }

  function submit() {
    if (save.isPending) return
    const records = [...students].map(([studentId, entry]) => ({ studentId, status: entry.status, note: entry.note?.trim() || null }))
    save.mutate(records, {
      onSuccess: (result) => {
        setDirty(false)
        setConfirmOpen(false)
        if (result.complete) {
          toast.success("تم حفظ الحضور بنجاح")
          router.push(paths.session(session.id))
        } else {
          toast.warning(`حُفظ تسجيل جزئي — ${countLabels.students(result.expectedCount - result.recordedCount)} دون تسجيل`, {
            description: "تبقى الحصة في قائمة الحضور غير المكتمل.",
          })
        }
      },
      onError: (error) => {
        setConfirmOpen(false)
        toast.error(errorMessage(error))
      },
    })
  }

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

      <section aria-labelledby="students-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="students-heading" className="text-base font-semibold">
            الطلبة <span className="text-sm font-normal text-muted-foreground">({countLabels.students(roster.length)})</span>
          </h2>
          {editable && unmarked.length > 0 && (
            <Button size="lg" onClick={markRemainingPresent}>
              <CheckCheck />
              {students.size === 0 ? "تحديد الجميع حاضر" : `تحديد الباقين حاضرين (${unmarked.length})`}
            </Button>
          )}
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
                onStatus={(status) => setStatus(student.id, status)}
                onNote={(note) => setNote(student.id, note)}
              />
            ))}
          </ul>
        )}
      </section>

      {editable && roster.length > 0 && (
        <div className="sticky bottom-3 z-10 mt-4 flex flex-col gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:gap-6 sm:p-4">
          <AttendanceProgress recorded={expectedCount - unmarked.length} expected={expectedCount} className="flex-1" />
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-warning">تغييرات غير محفوظة</span>}
            <Button
              size="lg"
              className="flex-1 sm:min-w-40 sm:flex-none"
              disabled={save.isPending || students.size === 0}
              onClick={() => (unmarked.length > 0 ? setConfirmOpen(true) : submit())}
            >
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              حفظ الحضور
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>الحضور غير مكتمل</AlertDialogTitle>
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
