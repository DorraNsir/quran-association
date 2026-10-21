"use client"

import { ArrowLeftRight, Loader2, Mic } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { FormErrorAlert } from "@/components/shared/form-error-alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage } from "@/lib/api/errors"
import { useEligibleSessions, useScheduleWorkItem } from "@/lib/api/work-followup"
import { nextRecitation, recitationOrdinal, sessionLabel } from "@/lib/work-followup"
import type { WorkItem, WorkProgram } from "@/types/work-followup"

import { WorkStatusBadge, WorkTypeBadge } from "./work-badges"

export type ScheduleMode = "carry" | "next"

/**
 * Two separate, MANUAL actions on one item, both into an existing upcoming
 * session of the same student, later than the source (never a free date —
 * the API lists and re-checks them):
 *  - «نقل إلى الحصة القادمة» continues the SAME unfinished task (same type,
 *    description and number); the original item keeps its result.
 *  - «إضافة العرضة التالية» plans the NEXT numbered recitation (+1).
 * The new item starts «لم يُقيّم بعد» in the target session's program
 * (created if the student has none there). Duplicates are refused.
 */
export function WorkScheduleDialog({
  open,
  onOpenChange,
  mode,
  item,
  source,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ScheduleMode
  item: WorkItem
  source: WorkProgram
}) {
  const proposal = mode === "next" ? nextRecitation(item) : undefined
  const [description, setDescription] = useState(proposal?.description ?? item.description)
  const eligible = useEligibleSessions(source.student.id, source.session.id)
  const options = eligible.data ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const targetId = picked ?? options[0]?.id ?? ""
  const target = options.find((s) => s.id === targetId)
  const scheduleItem = useScheduleWorkItem()
  const [serverError, setServerError] = useState<string | null>(null)

  // Known duplicates (the API refuses them anyway)
  const already = (mode === "carry" ? item.carriedTo : item.continuedBy).some((l) => l.sessionId === targetId)
  const Icon = mode === "carry" ? ArrowLeftRight : Mic

  async function confirm() {
    if (!targetId || scheduleItem.isPending) return
    setServerError(null)
    try {
      await scheduleItem.mutateAsync({ itemId: item.id, mode, targetSessionId: targetId, description: description.trim() })
      toast.success(mode === "carry" ? "تم نقل العمل إلى الحصة القادمة" : "تمت إضافة العرضة التالية", {
        description: target ? `${sessionLabel(target)}${target.programId ? " — أُضيف إلى البرنامج الموجود" : " — برنامج جديد"}` : undefined,
      })
      onOpenChange(false)
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-5 text-primary" aria-hidden />
            {mode === "carry" ? "نقل إلى الحصة القادمة" : "إضافة العرضة التالية"}
          </DialogTitle>
          <DialogDescription>
            {mode === "carry"
              ? "يُضاف نفس العمل إلى حصة قادمة بحالة «لم يُقيّم بعد»، ويبقى العمل الأصلي وتقييمه كما هما."
              : "تُبرمج العرضة الموالية في حصة قادمة، وتبقى العرضة السابقة وتقييمها كما هما."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="text-xs text-muted-foreground">العمل الأصلي — {sessionLabel(source.session)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber ?? undefined} />
              <span className="min-w-0 max-w-full font-medium whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item.description}</span>
              <WorkStatusBadge status={item.status} />
            </div>
          </div>

          {mode === "next" && proposal && (
            <div className="space-y-1.5">
              <Label htmlFor="wf-next-desc">العرضة التالية (العرضة {recitationOrdinal(proposal.number)})</Label>
              <Input id="wf-next-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wf-target">الحصة</Label>
            {eligible.isPending ? (
              <p className="text-sm text-muted-foreground">جارٍ تحميل الحصص القادمة…</p>
            ) : eligible.isError ? (
              <p role="alert" className="text-sm text-destructive">{errorMessage(eligible.error)}</p>
            ) : options.length === 0 ? (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">لا توجد حصص قادمة متاحة لهذا الطالب</p>
            ) : (
              <Select value={targetId} onValueChange={setPicked}>
                <SelectTrigger id="wf-target" className="w-full">
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
            {target?.programId && !already && (
              <p className="text-xs text-muted-foreground">سيُضاف العمل إلى برنامج هذه الحصة الموجود.</p>
            )}
          </div>

          <FormErrorAlert
            message={
              already
                ? `${mode === "carry" ? "سبق نقل هذا العمل إلى هذه الحصة." : "هذه العرضة مبرمجة مسبقًا في هذه الحصة."} اختر حصة أخرى.`
                : serverError
            }
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button disabled={!targetId || already || !description.trim() || scheduleItem.isPending} onClick={confirm}>
            {scheduleItem.isPending && <Loader2 className="animate-spin" />}
            تأكيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
