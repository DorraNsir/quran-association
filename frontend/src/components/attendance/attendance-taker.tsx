"use client"

import { CalendarX2, CheckCheck, Lock, Save, SearchX, UsersRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { SessionHeader } from "@/components/sessions/session-header"
import type { SessionRow } from "@/components/sessions/use-session-rows"
import { EmptyState } from "@/components/shared/empty-state"
import { matchesText, SearchInput } from "@/components/shared/filters"
import { SectionCard } from "@/components/shared/info-list"
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
import { canTakeAttendance } from "@/lib/attendance"
import { fullName } from "@/lib/domain"
import { countLabels, formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { operations, type AttendanceEntry } from "@/lib/store/operations"
import type { AttendanceStatus, ID, ISODate } from "@/types/domain"

import { StudentAttendanceRow, TeacherAttendanceList } from "./attendance-rows"
import { AttendanceProgress } from "./attendance-stats"

/**
 * Fast attendance taking: mark everyone present, change the exceptions,
 * save. Works as one-tap cards on phones and compact rows on desktop.
 * Remount (key) per session so the draft starts from saved data.
 */
export function AttendanceTaker({ row, today }: { row: SessionRow; today: ISODate }) {
  const router = useRouter()
  const { session, group, roster } = row
  const [students, setStudents] = useState(
    () => new Map<ID, AttendanceEntry>(row.records.map((r) => [r.studentId, { status: r.status, note: r.note }]))
  )
  const [teachers, setTeachers] = useState(
    () => new Map<ID, AttendanceEntry>(row.teacherRecords.map((r) => [r.teacherId, { status: r.status, note: r.note }]))
  )
  const [query, setQuery] = useState("")
  const [onlyUnmarked, setOnlyUnmarked] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dirty, setDirty] = useState(false)

  const editable = canTakeAttendance(session, today)
  const isEdit = row.records.length > 0
  const unmarked = roster.filter((s) => !students.has(s.id))
  const visible = roster.filter(
    (s) => (!query.trim() || matchesText(fullName(s), query)) && (!onlyUnmarked || !students.has(s.id))
  )
  const team = [
    ...(row.supervisor ? [{ teacher: row.supervisor, role: "SUPERVISOR" as const }] : []),
    ...row.assistants.map((teacher) => ({ teacher, role: "ASSISTANT" as const })),
  ]

  function update<T>(setter: React.Dispatch<React.SetStateAction<Map<ID, T>>>, id: ID, fn: (prev?: T) => T) {
    setter((prev) => new Map(prev).set(id, fn(prev.get(id))))
    setDirty(true)
  }
  const setStatus = (id: ID, status: AttendanceStatus) =>
    update(setStudents, id, (prev) => ({ ...prev, status }))
  const setNote = (id: ID, note: string) =>
    update(setStudents, id, (prev) => ({ status: prev?.status ?? "PRESENT", note }))

  /** Never overwrites a status already chosen — it only fills the gaps. */
  function markRemainingPresent() {
    setStudents((prev) => {
      const next = new Map(prev)
      for (const s of roster) if (!next.has(s.id)) next.set(s.id, { status: "PRESENT" })
      return next
    })
    setDirty(true)
  }

  function save(complete: boolean) {
    operations.saveAttendance(session.id, students, teachers, { complete })
    setDirty(false)
    if (complete) {
      toast.success("تم حفظ الحضور بنجاح", { description: labels.common.mockNotice })
      router.push(`/admin/sessions/${session.id}`)
    } else {
      toast.warning(`حُفظ تسجيل جزئي — ${countLabels.students(unmarked.length)} دون تسجيل`, {
        description: "تبقى الحصة في قائمة الحضور غير المكتمل.",
      })
    }
  }

  const crumbs = [
    { label: "الحصص", href: "/admin/sessions" },
    { label: `${group?.name ?? ""} — ${formatDate(session.date)}`, href: `/admin/sessions/${session.id}` },
    { label: isEdit ? "تعديل الحضور" : "تسجيل الحضور" },
  ]

  return (
    <>
      <Breadcrumbs className="mb-4" items={crumbs} />
      <SessionHeader row={row} />

      {!editable && (
        <Alert className="mb-6">
          {session.status === "CANCELLED" ? <CalendarX2 /> : <Lock />}
          <AlertTitle>{session.status === "CANCELLED" ? "هذه الحصة ملغاة" : "لم يحن موعد هذه الحصة بعد"}</AlertTitle>
          <AlertDescription>
            {session.status === "CANCELLED"
              ? "لا يُسجَّل الحضور في حصة ملغاة."
              : "يمكن تسجيل الحضور يوم الحصة أو بعدها."}
          </AlertDescription>
        </Alert>
      )}

      {team.length > 0 && (
        <SectionCard title="حضور المعلمين" icon={UsersRound} className="mb-6">
          <TeacherAttendanceList
            teachers={team}
            entries={teachers}
            disabled={!editable}
            onStatus={(id, status) => update(setTeachers, id, (prev) => ({ ...prev, status }))}
          />
        </SectionCard>
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
          <AttendanceProgress recorded={roster.length - unmarked.length} expected={roster.length} className="flex-1" />
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-warning">تغييرات غير محفوظة</span>}
            <Button
              size="lg"
              className="flex-1 sm:min-w-40 sm:flex-none"
              onClick={() => (unmarked.length > 0 ? setConfirmOpen(true) : save(true))}
            >
              <Save />
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
            <AlertDialogAction variant="outline" onClick={() => save(false)}>
              حفظ كتسجيل جزئي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
