"use client"

import { CalendarDays, Info, Plus, Repeat, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, errorMessage } from "@/lib/api/errors"
import { useCreateWorkProgram, useEligibleSessions, useUpdateWorkProgram, type NewWorkItemInput } from "@/lib/api/work-followup"
import {
  adaptDraft,
  recitationTitle,
  draftFromAssignment,
  emptyDraft,
  isBlankDraft,
  sameAssignment,
  toPayload,
  validateItemDraft,
  type AssignmentDraft,
} from "@/lib/quran-reference/work-assignment"
import { sessionLabel, WORK_TYPES, workTypeLabel } from "@/lib/work-followup"
import type { ID } from "@/types/domain"
import type { AssignmentPayload, WorkItem, WorkProgram, WorkType } from "@/types/work-followup"

import { AutoTextarea } from "./auto-textarea"
import { QuranAssignmentFields } from "./quran-assignment-fields"
import { WorkStatusBadge } from "./work-badges"
import { StudentCombobox } from "./student-combobox"
import type { WorkClassOption, WorkStudentOption } from "./work-followup-provider"

interface DraftItem {
  key: string
  /** A saved item (edit): kept, never deleted from here — its result is changed by evaluating it */
  saved?: WorkItem
  type: WorkType
  description: string
  recitationNumber: string
  /** Structured Quranic assignment, or free text (mode 'free') */
  assignment: AssignmentDraft
}

export interface WorkFormPreset {
  studentId: ID
  recitationSurah?: number
}

let draftSeq = 0
const blankItem = (): DraftItem => ({
  key: `d${++draftSeq}`,
  type: "REVISION",
  description: "",
  recitationNumber: "",
  assignment: emptyDraft("REVISION"),
})
/** «إضافة عرضة» from «متابعة العرضات»: a structured عرضة of that whole surah (the server numbers it). */
const recitationItem = (surah: number): DraftItem => ({
  key: `d${++draftSeq}`,
  type: "RECITATION",
  description: "",
  recitationNumber: "",
  assignment: { ...emptyDraft("RECITATION"), fromSurah: surah, toSurah: surah },
})
const toDraft = (i: WorkItem): DraftItem => ({
  key: i.id,
  saved: i,
  type: i.type,
  description: i.description,
  recitationNumber: i.recitationNumber ? String(i.recitationNumber) : "",
  // A legacy item stays free text: its description is never parsed into references
  assignment: draftFromAssignment(i.type, i.assignment),
})
/*
 * New items are structured only (no free-text fallback); free text exists only for items saved as
 * free text before Work Program 2.0 — kept as written, converted only by an explicit choice.
 * The same rules as mobile (shared module + mobile work-model.ts).
 */
const structured = (d: DraftItem) => d.assignment.mode !== "free"
/**
 * «متابعة العرضات»: the server numbers a structured عرضة (a new one, or one already in a cycle);
 * a legacy item keeps its own number field.
 */
const managedNumber = (d: DraftItem) => structured(d)
/** An item saved as free text (legacy): it may stay free text. */
const legacyFreeText = (d: DraftItem) => Boolean(d.saved && !d.saved.assignment)
/** A new item with nothing selected yet: ignored on save (an extra blank item never blocks it). */
const untouched = (d: DraftItem) => !d.saved && structured(d) && isBlankDraft(d.assignment)
/** The problem of an item's assignment, if any (structured references, or legacy free text). */
const assignmentError = (d: DraftItem) => (untouched(d) ? null : validateItemDraft(d.type, d.assignment, legacyFreeText(d)))
/** What is wrong with one item (null: it can be sent). */
function itemError(d: DraftItem): string | null {
  const e = assignmentError(d)
  if (e) return e.message
  return !structured(d) && !d.description.trim() ? "اكتب وصف العمل" : null
}
/** A new item: structured references only — the server writes its description. */
const newItemOf = (d: DraftItem): NewWorkItemInput => ({
  type: d.type,
  recitationNumber: numberOf(d),
  assignment: toPayload(d.assignment) as AssignmentPayload,
})
const numberOf = (d: DraftItem) =>
  d.type === "RECITATION" && Number(d.recitationNumber) > 0 ? Math.floor(Number(d.recitationNumber)) : null

/**
 * «إضافة برنامج عمل» / «تعديل البرنامج», saved through the API. The session
 * is picked among the student's EXISTING upcoming sessions (no date picker);
 * a student has at most one program per session — choosing one that exists
 * offers to edit it (the API refuses a duplicate anyway). Saved items are
 * never deleted: a dropped item is evaluated «ملغى».
 */
export function WorkProgramForm({
  open,
  onOpenChange,
  students,
  classes,
  program,
  preset,
  onOpenExisting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  students: WorkStudentOption[]
  classes: WorkClassOption[]
  /** Editing an existing program (its student and session are fixed) */
  program?: WorkProgram
  /** A new program prefilled from «متابعة العرضات»: the student, and a عرضة of the surah */
  preset?: WorkFormPreset
  onOpenExisting: (programId: ID) => void
}) {
  const editing = Boolean(program)
  const [studentId, setStudentId] = useState(
    program?.student.id ?? (preset && students.some((s) => s.id === preset.studentId) ? preset.studentId : "")
  )
  const [sessionId, setSessionId] = useState(program?.session.id ?? "")
  const [items, setItems] = useState<DraftItem[]>(() =>
    program ? program.items.map(toDraft) : [preset?.recitationSurah ? recitationItem(preset.recitationSurah) : blankItem()]
  )
  const [notes, setNotes] = useState(program?.generalNotes ?? "")
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  // A program created meanwhile by someone else (409 WORK_PROGRAM_EXISTS)
  const [raced, setRaced] = useState<string | null>(null)
  const create = useCreateWorkProgram()
  const update = useUpdateWorkProgram()
  const eligible = useEligibleSessions(editing ? undefined : studentId || undefined)

  const options = eligible.data ?? []
  const chosen = options.find((s) => s.id === sessionId)
  const existingId = raced ?? (!editing && chosen?.programId) ?? null
  const filled = items.filter((i) => !untouched(i))
  const itemErrors = new Map(filled.map((i) => [i.key, itemError(i)] as const))
  const errors = {
    student: !studentId ? "اختر الطالب" : undefined,
    session: !sessionId ? "اختر حصة قادمة" : undefined,
    items:
      filled.length === 0
        ? "أضف عملًا واحدًا على الأقل"
        : [...itemErrors.values()].some(Boolean)
          ? "صحّح الأعمال المشار إليها"
          : undefined,
  }
  const show = (error?: string) => (submitted ? error : undefined)
  const pending = create.isPending || update.isPending

  const updateDraft = (key: string, patch: Partial<DraftItem>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (pending || errors.student || errors.session || errors.items || existingId) return
    const newItems = filled.filter((d) => !d.saved).map(newItemOf)
    const generalNotes = notes.trim() || null
    try {
      if (!program) {
        await create.mutateAsync({ studentId, sessionId, generalNotes, items: newItems })
        toast.success("تم حفظ برنامج العمل")
      } else {
        // Only what changed, each with the version it was edited from
        const changed = items
          .filter((d): d is DraftItem & { saved: WorkItem } => Boolean(d.saved))
          .map((d) => {
            const assignment = toPayload(d.assignment)
            const description = d.description.trim()
            // Only what really changed: an unchanged text is not resent, so the server can keep
            // its default description in step with a changed range
            const descriptionChanged = description !== d.saved.description && description !== ""
            const assignmentChanged = !sameAssignment(d.saved.assignment, assignment)
            const typeOrNumberChanged = d.type !== d.saved.type || numberOf(d) !== d.saved.recitationNumber
            if (!descriptionChanged && !assignmentChanged && !typeOrNumberChanged) return null
            return {
              id: d.saved.id,
              version: d.saved.version,
              type: d.type,
              recitationNumber: numberOf(d),
              ...(descriptionChanged ? { description } : {}),
              ...(assignmentChanged ? { assignment } : {}),
            }
          })
          .filter((c) => c !== null)
        const notesChanged = generalNotes !== program.generalNotes
        await update.mutateAsync({
          id: program.id,
          ...(notesChanged ? { version: program.version, generalNotes } : {}),
          ...(changed.length ? { items: changed } : {}),
          ...(newItems.length ? { newItems } : {}),
        })
        toast.success("تم تحديث برنامج العمل")
      }
      onOpenChange(false)
    } catch (error) {
      const body = error instanceof ApiError ? (error.body as { programId?: string } | undefined) : undefined
      if (error instanceof ApiError && error.code === "WORK_PROGRAM_EXISTS" && body?.programId) setRaced(body.programId)
      else setServerError(errorMessage(error))
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "تعديل برنامج العمل" : "إضافة برنامج عمل"}
      description="برنامج عمل طالب لحصة واحدة: يمكن أن يضم عدة أعمال (حفظ، مراجعة، عرضة، اختبار)."
      onSubmit={submit}
      submitLabel="حفظ برنامج العمل"
      submitDisabled={Boolean(existingId)}
      pending={pending}
      error={serverError}
    >
      <FormSection title="الطالب والحصة">
        <FormField label="الطالب" required className="sm:col-span-2" error={show(errors.student)} id="wf-student">
          {editing ? (
            <p className="flex min-h-9 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1 text-sm">
              {program && (
                <>
                  <UserAvatar name={`${program.student.firstName} ${program.student.lastName}`} photoUrl={program.student.photoUrl ?? undefined} size="sm" />
                  {program.student.firstName} {program.student.lastName}
                </>
              )}
            </p>
          ) : (
            <StudentCombobox
              id="wf-student"
              value={studentId}
              students={students}
              classes={classes}
              invalid={Boolean(show(errors.student))}
              onChange={(id) => {
                setStudentId(id)
                setSessionId("")
                setRaced(null)
              }}
            />
          )}
        </FormField>

        <FormField label="الحصة القادمة" required className="sm:col-span-2" error={show(errors.session)} id="wf-session">
          {editing ? (
            <p className="flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm">
              <CalendarDays className="size-4 text-primary" aria-hidden />
              {program && sessionLabel(program.session)}
            </p>
          ) : !studentId ? (
            <p className="text-sm text-muted-foreground">اختر الطالب أولًا لعرض حصصه القادمة.</p>
          ) : eligible.isPending ? (
            <p className="text-sm text-muted-foreground">جارٍ تحميل الحصص القادمة…</p>
          ) : eligible.isError ? (
            <p role="alert" className="text-sm text-destructive">{errorMessage(eligible.error)}</p>
          ) : options.length === 0 ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">لا توجد حصص قادمة متاحة لهذا الطالب</p>
          ) : (
            <Select
              value={sessionId}
              onValueChange={(id) => {
                setSessionId(id)
                setRaced(null)
              }}
            >
              <SelectTrigger id="wf-session" className="w-full" aria-invalid={Boolean(show(errors.session)) || undefined}>
                <SelectValue placeholder="اختر من الحصص القادمة" />
              </SelectTrigger>
              <SelectContent position="popper">
                {options.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {sessionLabel(s)}
                    {s.programId ? " · يوجد برنامج" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        {existingId && (
          <Alert className="sm:col-span-2">
            <Info />
            <AlertTitle>يوجد برنامج عمل لهذه الحصة. هل تريد تعديله؟</AlertTitle>
            <AlertDescription>
              <p>لكل طالب برنامج واحد في الحصة الواحدة؛ يمكنك إضافة أعمال جديدة إلى البرنامج الموجود.</p>
              <Button type="button" size="sm" className="mt-2" onClick={() => onOpenExisting(existingId)}>
                تعديل البرنامج الموجود
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </FormSection>

      <FormSection title="الأعمال">
        <div className="space-y-3 sm:col-span-2">
          {items.map((item, index) => (
            <fieldset key={item.key} className="min-w-0 space-y-3 rounded-lg border p-3">
              <legend className="sr-only">العمل {index + 1}</legend>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">العمل {index + 1}</p>
                <div className="flex items-center gap-2">
                  {item.saved && item.saved.status !== "NOT_EVALUATED" && <WorkStatusBadge status={item.saved.status} />}
                  {/* Only a not-yet-saved item can be removed; a saved one is evaluated «ملغى» instead */}
                  {!item.saved && items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`حذف العمل ${index + 1}`}
                      onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </div>
              {/* One column: type, then the full-width description, then the recitation number */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor={`${item.key}-type`} className="text-xs text-muted-foreground">نوع العمل</label>
                  <Select
                    value={item.type}
                    onValueChange={(type) =>
                      updateDraft(item.key, { type: type as WorkType, assignment: adaptDraft(item.assignment, type as WorkType) })
                    }
                  >
                    <SelectTrigger id={`${item.key}-type`} className="w-full sm:w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {WORK_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {workTypeLabel[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <QuranAssignmentFields
                  id={item.key}
                  type={item.type}
                  draft={item.assignment}
                  onChange={(assignment) => updateDraft(item.key, { assignment })}
                  error={submitted ? assignmentError(item) : null}
                  allowFree={legacyFreeText(item)}
                />
                {/*
                  Free text only for a legacy item kept as written. A structured item has no text
                  field: the server writes its description, and a saved one is never resent.
                  Session notes go in «ملاحظات المعلم».
                */}
                {!structured(item) && (
                  <div className="space-y-1.5">
                    <label htmlFor={`${item.key}-desc`} className="text-xs text-muted-foreground">
                      وصف العمل
                    </label>
                    <AutoTextarea
                      id={`${item.key}-desc`}
                      value={item.description}
                      onChange={(e) => updateDraft(item.key, { description: e.target.value })}
                      placeholder={PLACEHOLDER[item.type]}
                      maxLength={2000}
                      aria-invalid={(submitted && !item.description.trim()) || undefined}
                    />
                  </div>
                )}
                {submitted && !structured(item) && itemErrors.get(item.key) && (
                  <p role="alert" className="text-sm text-destructive">
                    {itemErrors.get(item.key)}
                  </p>
                )}
                {/* «متابعة العرضات»: a structured عرضة is numbered by the server, in its surah's history */}
                {item.type === "RECITATION" && managedNumber(item) && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Repeat className="size-3.5 shrink-0 text-primary" aria-hidden />
                    {item.saved?.recitationNumber ? `${recitationTitle(item.saved.recitationNumber)} — يُحدَّد الرقم تلقائيًا` : "يُحدَّد رقم العرضة تلقائيًا"}
                  </p>
                )}
                {item.type === "RECITATION" && !managedNumber(item) && (
                  <div className="space-y-1.5">
                    <label htmlFor={`${item.key}-num`} className="text-xs text-muted-foreground">رقم العرضة (اختياري)</label>
                    <Input
                      id={`${item.key}-num`}
                      type="number"
                      min={1}
                      step={1}
                      dir="ltr"
                      className="w-28"
                      value={item.recitationNumber}
                      onChange={(e) => updateDraft(item.key, { recitationNumber: e.target.value })}
                      placeholder="2"
                    />
                  </div>
                )}
              </div>
            </fieldset>
          ))}
          {show(errors.items) && <p role="alert" className="text-sm text-destructive">{errors.items}</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, blankItem()])}>
            <Plus />
            إضافة عمل آخر
          </Button>
        </div>
      </FormSection>

      <FormSection title="ملاحظات المعلم">
        <div className="sm:col-span-2">
          <Textarea
            aria-label="ملاحظات المعلم"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظة عامة حول هذا البرنامج (اختياري)"
          />
        </div>
      </FormSection>
    </FormSheet>
  )
}

const PLACEHOLDER: Record<WorkType, string> = {
  MEMORIZATION: "حفظ صفحتين من سورة البقرة",
  REVISION: "مراجعة من سورة الزمر إلى سورة الناس",
  RECITATION: "العرضة الثانية من سورة التوبة",
  EXAM: "اختبار من سورة الروم إلى سورة الناس",
}
