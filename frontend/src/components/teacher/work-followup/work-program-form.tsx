"use client"

import { CalendarDays, Info, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, errorMessage } from "@/lib/api/errors"
import { useCreateWorkProgram, useEligibleSessions, useUpdateWorkProgram } from "@/lib/api/work-followup"
import { sessionLabel, WORK_TYPES, workTypeLabel } from "@/lib/work-followup"
import type { ID } from "@/types/domain"
import type { WorkItem, WorkProgram, WorkType } from "@/types/work-followup"

import { AutoTextarea } from "./auto-textarea"
import { WorkStatusBadge } from "./work-badges"
import type { WorkClassOption, WorkStudentOption } from "./work-followup-provider"

interface DraftItem {
  key: string
  /** A saved item (edit): kept, never deleted from here — its result is changed by evaluating it */
  saved?: WorkItem
  type: WorkType
  description: string
  recitationNumber: string
}

let draftSeq = 0
const blankItem = (): DraftItem => ({ key: `d${++draftSeq}`, type: "REVISION", description: "", recitationNumber: "" })
const toDraft = (i: WorkItem): DraftItem => ({
  key: i.id,
  saved: i,
  type: i.type,
  description: i.description,
  recitationNumber: i.recitationNumber ? String(i.recitationNumber) : "",
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
  onOpenExisting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  students: WorkStudentOption[]
  classes: WorkClassOption[]
  /** Editing an existing program (its student and session are fixed) */
  program?: WorkProgram
  onOpenExisting: (programId: ID) => void
}) {
  const editing = Boolean(program)
  const [studentId, setStudentId] = useState(program?.student.id ?? "")
  const [sessionId, setSessionId] = useState(program?.session.id ?? "")
  const [items, setItems] = useState<DraftItem[]>(() => (program ? program.items.map(toDraft) : [blankItem()]))
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
  const filled = items.filter((i) => i.description.trim())
  const errors = {
    student: !studentId ? "اختر الطالب" : undefined,
    session: !sessionId ? "اختر حصة قادمة" : undefined,
    items: filled.length === 0 ? "أضف عملًا واحدًا على الأقل مع وصفه" : undefined,
  }
  const show = (error?: string) => (submitted ? error : undefined)
  const pending = create.isPending || update.isPending

  const updateDraft = (key: string, patch: Partial<DraftItem>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (pending || errors.student || errors.session || errors.items || existingId) return
    const newItems = filled
      .filter((d) => !d.saved)
      .map((d) => ({ type: d.type, description: d.description.trim(), recitationNumber: numberOf(d) }))
    const generalNotes = notes.trim() || null
    try {
      if (!program) {
        await create.mutateAsync({ studentId, sessionId, generalNotes, items: newItems })
        toast.success("تم حفظ برنامج العمل")
      } else {
        // Only what changed, each with the version it was edited from
        const changed = items
          .filter((d): d is DraftItem & { saved: WorkItem } => Boolean(d.saved))
          .filter((d) => d.type !== d.saved.type || d.description.trim() !== d.saved.description || numberOf(d) !== d.saved.recitationNumber)
          .map((d) => ({ id: d.saved.id, version: d.saved.version, type: d.type, description: d.description.trim(), recitationNumber: numberOf(d) }))
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
            <p className="flex h-9 items-center rounded-lg border bg-muted/40 px-2.5 text-sm">{program && `${program.student.firstName} ${program.student.lastName}`}</p>
          ) : (
            <Select
              value={studentId}
              onValueChange={(id) => {
                setStudentId(id)
                setSessionId("")
                setRaced(null)
              }}
            >
              <SelectTrigger id="wf-student" className="w-full" aria-invalid={Boolean(show(errors.student)) || undefined}>
                <SelectValue placeholder="اختر الطالب" />
              </SelectTrigger>
              <SelectContent position="popper">
                {classes.map((c) => (
                  <SelectGroup key={c.id}>
                    <SelectLabel>{c.label}</SelectLabel>
                    {students
                      .filter((s) => s.groupClassId === c.id)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.firstName} {s.lastName}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
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
                  <Select value={item.type} onValueChange={(type) => updateDraft(item.key, { type: type as WorkType })}>
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
                <div className="space-y-1.5">
                  <label htmlFor={`${item.key}-desc`} className="text-xs text-muted-foreground">وصف العمل</label>
                  <AutoTextarea
                    id={`${item.key}-desc`}
                    value={item.description}
                    onChange={(e) => updateDraft(item.key, { description: e.target.value })}
                    placeholder={PLACEHOLDER[item.type]}
                    maxLength={2000}
                  />
                </div>
                {item.type === "RECITATION" && (
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
