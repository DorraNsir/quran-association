"use client"

import { CalendarDays } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { FormSection, FormSheet } from "@/components/shared/form"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api/errors"
import { useEvaluateWorkProgram } from "@/lib/api/work-followup"
import { cn } from "@/lib/utils"
import { cancelledLabel, progressLabel, progressOf, sessionLabel, WORK_STATUSES, workStatusLabel } from "@/lib/work-followup"
import type { WorkProgram, WorkStatus } from "@/types/work-followup"

import { WORK_STATUS_STYLE, WorkTypeBadge } from "./work-badges"

/**
 * «تقييم الأعمال»: each item gets its own result (and an optional comment)
 * — during, or after, the session. Only the changed items are sent, each
 * with the version it was loaded at: the API refuses (instead of
 * overwriting) an item someone else evaluated meanwhile. Independent from
 * attendance and from «متابعة الحفظ».
 */
export function WorkEvaluationSheet({
  open,
  onOpenChange,
  program,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  program: WorkProgram
}) {
  const evaluate = useEvaluateWorkProgram()
  const [items, setItems] = useState(program.items)
  const [notes, setNotes] = useState(program.generalNotes ?? "")
  const [serverError, setServerError] = useState<string | null>(null)
  const { student, session } = program
  const name = `${student.firstName} ${student.lastName}`
  const progress = progressOf(items)
  const setItem = (id: string, patch: { status?: WorkStatus; evaluationComment?: string }) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (evaluate.isPending) return
    setServerError(null)
    const changed = items.filter((draft) => {
      const saved = program.items.find((i) => i.id === draft.id)!
      return draft.status !== saved.status || (draft.evaluationComment?.trim() || null) !== saved.evaluationComment
    })
    const generalNotes = notes.trim() || null
    const notesChanged = generalNotes !== program.generalNotes
    if (changed.length === 0 && !notesChanged) return onOpenChange(false)
    try {
      const saved = await evaluate.mutateAsync({
        id: program.id,
        items: changed.map((i) => ({ id: i.id, version: i.version, status: i.status, evaluationComment: i.evaluationComment?.trim() || null })),
        ...(notesChanged ? { version: program.version, generalNotes } : {}),
      })
      toast.success("تم حفظ التقييم", { description: progressLabel(saved.progress) })
      onOpenChange(false)
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="تقييم الأعمال"
      description={`${progressLabel(progress)}${progress.pending ? ` · ${progress.pending} بانتظار التقييم` : ""}${progress.cancelled ? ` · ${cancelledLabel(progress.cancelled)}` : ""}`}
      onSubmit={submit}
      submitLabel="حفظ التقييم"
      pending={evaluate.isPending}
      error={serverError}
    >
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <UserAvatar name={name} photoUrl={student.photoUrl ?? undefined} />
        <div className="min-w-0">
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">
            {session.groupName} — {session.branchName}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm">
            <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
            {sessionLabel(session)}
          </p>
        </div>
      </div>

      <FormSection title="الأعمال">
        <ol className="space-y-4 sm:col-span-2">
          {items.map((item) => (
            <li key={item.id} className="space-y-2.5 border-b pb-4 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber ?? undefined} />
                <span className="min-w-0 max-w-full text-sm font-medium whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item.description}</span>
              </div>
              <div role="radiogroup" aria-label={`تقييم: ${item.description}`} className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {WORK_STATUSES.map((status) => {
                  const { icon: Icon, selected } = WORK_STATUS_STYLE[status]
                  const checked = item.status === status
                  return (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setItem(item.id, { status })}
                      className={cn(
                        "flex h-9 items-center justify-center gap-1 rounded-lg border bg-background px-2 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        checked ? selected : "text-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {workStatusLabel[status]}
                    </button>
                  )
                })}
              </div>
              <Input
                aria-label={`تعليق على: ${item.description}`}
                value={item.evaluationComment ?? ""}
                onChange={(e) => setItem(item.id, { evaluationComment: e.target.value })}
                placeholder="تعليق على التقييم (اختياري)"
                maxLength={1000}
              />
            </li>
          ))}
        </ol>
      </FormSection>

      <FormSection title="ملاحظات المعلم">
        <div className="sm:col-span-2">
          <Textarea
            aria-label="ملاحظات المعلم"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظة عامة حول أداء الطالب في هذه الحصة (اختياري)"
          />
        </div>
      </FormSection>
    </FormSheet>
  )
}
