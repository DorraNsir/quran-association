"use client"

import { Lock, NotebookPen, Pencil, Plus, SearchX, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { FormErrorAlert } from "@/components/shared/form-error-alert"
import { AutoTextarea } from "@/components/teacher/work-followup/auto-textarea"
import { ActionsMenu } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { matchesText, SearchInput } from "@/components/shared/filters"
import { QueryState } from "@/components/shared/query-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { errorMessage } from "@/lib/api/errors"
import { useDeleteTeacherNote, useSaveTeacherNote, useTeacherNotes } from "@/lib/api/teacher-notes"
import { formatDateTime } from "@/lib/format"
import { labels } from "@/lib/i18n"
import type { TeacherNote } from "@/types/domain"

const MAX_LENGTH = 2000

/** Reminder shown wherever notes are written: nobody else can read them. */
export function PrivateNotice({ className }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ""}`}>
      <Lock className="size-3.5 shrink-0" aria-hidden />
      ملاحظاتك الشخصية الخاصة، لا يمكن لأي شخص آخر الاطلاع عليها.
    </p>
  )
}

/** Wraps long Arabic text, line breaks and very long words inside the card. */
const WRAP = "min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]"

/**
 * «ملاحظاتي»: the signed-in teacher's private notebook — their own notes
 * only (the API never returns anyone else's), most recently updated first.
 * A note is just its text: no student, no class, no date to enter (the
 * dates are set by the server).
 */
export function TeacherNotes() {
  const notesQuery = useTeacherNotes()
  const saveNote = useSaveTeacherNote()
  const deleteNote = useDeleteTeacherNote()
  const [query, setQuery] = useState("")
  const [editor, setEditor] = useState<{ note?: TeacherNote; key: number; open: boolean }>({ key: 0, open: false })
  const [deleting, setDeleting] = useState<TeacherNote | null>(null)

  const notes = [...(notesQuery.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const shown = notes.filter((n) => !query.trim() || matchesText(n.content, query))
  const openEditor = (note?: TeacherNote) => setEditor((prev) => ({ note, key: prev.key + 1, open: true }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PrivateNotice />
        <Button onClick={() => openEditor()}>
          <Plus />
          إضافة ملاحظة
        </Button>
      </div>
      {notes.length > 0 && (
        <SearchInput value={query} onChange={setQuery} label="البحث في الملاحظات" placeholder="ابحث في الملاحظات…" className="sm:max-w-xs" />
      )}

      <QueryState query={notesQuery}>
        {shown.length === 0 ? (
          <Card className="p-0">
            {notes.length === 0 ? (
              <EmptyState icon={NotebookPen} title="لا توجد ملاحظات بعد" description="دوّن ملاحظاتك الشخصية هنا، فهي تبقى خاصة بك." />
            ) : (
              <EmptyState icon={SearchX} title="لا توجد ملاحظات مطابقة" />
            )}
          </Card>
        ) : (
          <ul className="space-y-3">
            {shown.map((note) => (
              <li key={note.id}>
                <Card className="gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      <span className="inline-block">{formatDateTime(note.createdAt)}</span>
                    </p>
                    <ActionsMenu
                      label="إجراءات الملاحظة"
                      actions={[
                        { label: "تعديل", icon: Pencil, onSelect: () => openEditor(note) },
                        { label: "حذف", icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(note) },
                      ]}
                    />
                  </div>
                  <p className={`text-sm leading-relaxed ${WRAP}`}>{note.content}</p>
                  {note.updatedAt !== note.createdAt && (
                    <p className="text-xs text-muted-foreground">
                      آخر تعديل: <span className="inline-block">{formatDateTime(note.updatedAt)}</span>
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      <NoteDialog
        key={editor.key}
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        note={editor.note}
        pending={saveNote.isPending}
        error={saveNote.isError ? errorMessage(saveNote.error) : undefined}
        onSave={(content) => {
          if (saveNote.isPending) return
          const editing = Boolean(editor.note)
          saveNote.mutateAsync({ id: editor.note?.id, content }).then(
            () => {
              setEditor((prev) => ({ ...prev, open: false }))
              toast.success(editing ? "تم تعديل الملاحظة" : "تمت إضافة الملاحظة")
            },
            () => {} // shown in the dialog
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
  onSave,
  pending,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  note?: TeacherNote
  onSave: (content: string) => void
  pending?: boolean
  error?: string
}) {
  const [content, setContent] = useState(note?.content ?? "")
  const [submitted, setSubmitted] = useState(false)
  const invalid = !content.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid min-w-0 gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(true)
            if (!invalid) onSave(content.trim())
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NotebookPen className="size-5 text-primary" aria-hidden />
              {note ? "تعديل الملاحظة" : "ملاحظة جديدة"}
            </DialogTitle>
            <DialogDescription>تُحفظ الملاحظة بتاريخها تلقائيًا، ولا يطّلع عليها أحد غيرك.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="note-content">
              الملاحظة
              <span className="text-destructive" aria-hidden>*</span>
            </Label>
            <AutoTextarea
              id="note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_LENGTH}
              placeholder="اكتب ملاحظتك…"
              aria-invalid={(submitted && invalid) || undefined}
              autoFocus
            />
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-destructive">{submitted && invalid && "اكتب نص الملاحظة"}</span>
              <span className="text-muted-foreground tabular-nums">
                {content.length}/{MAX_LENGTH}
              </span>
            </div>
          </div>

          {error && <FormErrorAlert message={error} />}
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
