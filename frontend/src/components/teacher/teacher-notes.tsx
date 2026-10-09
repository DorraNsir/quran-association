"use client"

import { Lock, NotebookPen, Pencil, Plus, SearchX, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { PersonCell } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { fullName, indexLookups, studentClass, type Lookups } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { QueryState } from "@/components/shared/query-state"
import { errorMessage } from "@/lib/api/errors"
import { useDeleteTeacherNote, useSaveTeacherNote, useStudentTeacherNotes, useTeacherNotes } from "@/lib/api/teacher-notes"
import type { ID, ISODate, Student, TeacherNote } from "@/types/domain"

const MAX_LENGTH = 1000

/** Reminder shown wherever notes are written: they stay internal. */
export function PrivateNotice({ className }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ""}`}>
      <Lock className="size-3.5 shrink-0" aria-hidden />
      ملاحظات داخلية خاصة بك — لا تظهر للطلبة ولا للأولياء.
    </p>
  )
}

/**
 * The signed-in teacher's private notes: all of them (with a student
 * picker), or those about one student when `studentId` is given.
 * Teacher and class are never chosen: the teacher is the signed-in one
 * and the class is the student's.
 */
export function TeacherNotes({
  teacherId,
  students,
  lookups,
  today,
  studentId,
}: {
  teacherId: ID
  /** The teacher's own students — the only ones a note can be about */
  students: Student[]
  lookups: Lookups
  today: ISODate
  studentId?: ID
}) {
  const notesQuery = useTeacherNotes(teacherId)
  const teacherNotes = notesQuery.data ?? []
  const saveNote = useSaveTeacherNote()
  const deleteNote = useDeleteTeacherNote()
  const [query, setQuery] = useState("")
  const [studentFilter, setStudentFilter] = useState(ALL)
  const [editor, setEditor] = useState<{ note?: TeacherNote; key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<TeacherNote | null>(null)

  const indexes = indexLookups(lookups)
  const studentsById = new Map(students.map((s) => [s.id, s]))
  const mine = teacherNotes
    // Only notes about students the teacher still teaches
    .filter((n) => studentsById.has(n.studentId) && (!studentId || n.studentId === studentId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
  const shown = mine.filter(
    (n) =>
      (studentFilter === ALL || n.studentId === studentFilter) &&
      (!query.trim() || matchesText(`${n.content} ${fullName(studentsById.get(n.studentId)!)}`, query))
  )
  const openEditor = (note?: TeacherNote) => setEditor((prev) => ({ note, key: prev.key + 1, open: true }))
  const addButton = (
    <Button onClick={() => openEditor()} disabled={students.length === 0}>
      <Plus />
      إضافة ملاحظة
    </Button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PrivateNotice />
        {addButton}
      </div>
      {!studentId && mine.length > 0 && (
        <FilterBar
          hasActiveFilters={Boolean(query) || studentFilter !== ALL}
          onReset={() => {
            setQuery("")
            setStudentFilter(ALL)
          }}
          resultLabel={`${shown.length} ملاحظة`}
          search={<SearchInput value={query} onChange={setQuery} label="البحث في الملاحظات" placeholder="ابحث في الملاحظات…" />}
        >
          <FilterSelect label="الطالب" allLabel="كل الطلبة" value={studentFilter} onValueChange={setStudentFilter}
            options={students.map((s) => ({ value: s.id, label: fullName(s) }))} />
        </FilterBar>
      )}

      {shown.length === 0 ? (
        <Card className="p-0">
          {mine.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="لا توجد ملاحظات بعد"
              description="دوّن ملاحظاتك حول تقدّم الطالب وسلوكه، فهي تبقى خاصة بك."
            />
          ) : (
            <EmptyState icon={SearchX} title="لا توجد ملاحظات مطابقة" />
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((note) => {
            const student = studentsById.get(note.studentId)!
            const view = studentClass({ groupClassId: note.groupClassId }, indexes)
            return (
              <li key={note.id}>
                <Card className="gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    {studentId ? (
                      <p className="text-sm font-medium">{formatDate(note.date)}</p>
                    ) : (
                      <Link href={`/teacher/students/${student.id}?tab=notes`} className="min-w-0 hover:opacity-80">
                        <PersonCell name={fullName(student)} photoUrl={student.photoUrl} size="sm"
                          secondary={`${formatDate(note.date)} · ${view?.group?.name ?? ""} (${view?.branch?.name ?? ""})`} />
                      </Link>
                    )}
                    <ActionsMenu
                      label="إجراءات الملاحظة"
                      actions={[
                        { label: "تعديل", icon: Pencil, onSelect: () => openEditor(note) },
                        { label: "حذف", icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(note) },
                      ]}
                    />
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  {note.updatedAt !== note.createdAt && (
                    <p className="text-xs text-muted-foreground">آخر تعديل: {formatDate(note.updatedAt)}</p>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <NoteDialog
        key={editor.key}
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        note={editor.note}
        students={students}
        fixedStudentId={studentId}
        today={today}
        pending={saveNote.isPending}
        error={saveNote.isError ? errorMessage(saveNote.error) : undefined}
        onSave={(values) => {
          if (saveNote.isPending) return
          saveNote.mutate(
            { id: editor.note?.id, studentId: values.studentId, date: values.date, content: values.content },
            {
              onSuccess: () => {
                setEditor((prev) => ({ ...prev, open: false }))
                toast.success(editor.note ? "تم تعديل الملاحظة" : "تمت إضافة الملاحظة")
              },
            }
          )
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="حذف هذه الملاحظة؟"
        description="لا يمكن التراجع عن الحذف."
        confirmLabel="حذف"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          await deleteNote.mutateAsync(deleting.id)
          setDeleting(null)
          toast.success("تم حذف الملاحظة")
        }}
      />
    </div>
  )
}

function NoteDialog({
  open,
  onOpenChange,
  note,
  students,
  fixedStudentId,
  today,
  onSave,
  pending,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  note?: TeacherNote
  students: Student[]
  fixedStudentId?: ID
  today: ISODate
  onSave: (values: { studentId: ID; date: ISODate; content: string }) => void
  pending?: boolean
  error?: string
}) {
  const [studentId, setStudentId] = useState(note?.studentId ?? fixedStudentId ?? "")
  const [date, setDate] = useState(note?.date ?? today)
  const [content, setContent] = useState(note?.content ?? "")
  const [submitted, setSubmitted] = useState(false)
  const errors = {
    student: !studentId ? "اختر الطالب" : undefined,
    date: !date ? "حدّد التاريخ" : date > today ? "لا يمكن أن يكون التاريخ في المستقبل" : undefined,
    content: !content.trim() ? "اكتب نص الملاحظة" : undefined,
  }
  const valid = !errors.student && !errors.date && !errors.content
  const fixedStudent = students.find((s) => s.id === (note?.studentId ?? fixedStudentId))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(true)
            if (valid) onSave({ studentId, date, content })
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NotebookPen className="size-5 text-primary" aria-hidden />
              {note ? "تعديل الملاحظة" : "ملاحظة جديدة"}
            </DialogTitle>
            <DialogDescription>
              {fixedStudent ? `حول ${fullName(fixedStudent)}` : "اختر الطالب ثم دوّن ملاحظتك."}
            </DialogDescription>
          </DialogHeader>

          {!fixedStudent && (
            <div className="space-y-1.5">
              <Label htmlFor="note-student">الطالب</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger id="note-student" className="w-full" aria-invalid={(submitted && !!errors.student) || undefined}>
                  <SelectValue placeholder="اختر الطالب" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {fullName(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {submitted && errors.student && <p className="text-xs text-destructive">{errors.student}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note-date">التاريخ</Label>
            <Input id="note-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-48" aria-invalid={(submitted && !!errors.date) || undefined} />
            {submitted && errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-content">الملاحظة</Label>
            <Textarea id="note-content" value={content} onChange={(e) => setContent(e.target.value)} rows={5}
              maxLength={MAX_LENGTH} placeholder="مثال: تحسّن في التجويد، يحتاج إلى مراجعة سورة…"
              aria-invalid={(submitted && !!errors.content) || undefined} />
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-destructive">{submitted && errors.content}</span>
              <span className="text-muted-foreground tabular-nums">{content.length}/{MAX_LENGTH}</span>
            </div>
          </div>

          <PrivateNotice />

          {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" className="min-w-24" disabled={pending}>
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Admin read-only view of the notes teachers wrote about one student. */
export function StudentTeacherNotes({ studentId, lookups }: { studentId: ID; lookups: Lookups }) {
  const query = useStudentTeacherNotes(studentId)
  const indexes = indexLookups(lookups)
  const notes = query.data ?? []
  if (!query.data) return <QueryState query={query}>{null}</QueryState>

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden />
        ملاحظات داخلية يدوّنها المعلمون — للاطلاع فقط، ولا تظهر للطالب ولا للولي.
      </p>
      {notes.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={NotebookPen} title="لا توجد ملاحظات للمعلمين حول هذا الطالب" />
        </Card>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => {
            const teacher = note.teacher
            const view = studentClass({ groupClassId: note.groupClassId }, indexes)
            return (
              <li key={note.id}>
                <Card className="gap-2 p-4">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{teacher ? fullName(teacher) : "—"}</span> ·{" "}
                    {formatDate(note.date)} · {view?.group?.name} ({view?.branch?.name})
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
