"use client"

import { ArrowLeftRight, Mic } from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { eligibleSessions, nextRecitation, programOf, recitationOrdinal, sessionLabel } from "@/lib/work-followup"
import type { ID, ISODate } from "@/types/domain"
import type { WorkFollowupData, WorkItem, WorkProgram } from "@/types/work-followup"

import { WorkStatusBadge, WorkTypeBadge } from "./work-badges"

export type ScheduleMode = "carry" | "next"

/**
 * Two separate, MANUAL actions on one item, both into an existing upcoming
 * session of the same student (never an arbitrary date):
 *  - «نقل إلى الحصة القادمة» continues the SAME unfinished task (same type,
 *    description and number); the original item keeps its result.
 *  - «إضافة العرضة التالية» plans the NEXT numbered recitation (+1).
 * The new item starts «لم يُقيّم بعد» and is appended to the target
 * session's program (created if the student has none there).
 */
export function WorkScheduleDialog({
  open,
  onOpenChange,
  mode,
  item,
  source,
  data,
  today,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ScheduleMode
  item: WorkItem
  source: WorkProgram
  data: WorkFollowupData
  today: ISODate
  onConfirm: (targetSessionId: ID, item: Omit<WorkItem, "id">) => void
}) {
  const proposal = mode === "next" ? nextRecitation(item) : undefined
  const [description, setDescription] = useState(proposal?.description ?? item.description)
  const options = eligibleSessions(data, source.studentId, today).filter((s) => s.id !== source.sessionId)
  const [targetId, setTargetId] = useState(options[0]?.id ?? "")
  const sourceSession = data.sessions.find((s) => s.id === source.sessionId)

  // No accidental duplicate in the target session
  const target = targetId ? programOf(data.programs, source.studentId, targetId) : undefined
  const duplicate =
    mode === "carry"
      ? target?.items.some((i) => i.carriedFromItemId === item.id)
      : target?.items.some((i) => i.type === "RECITATION" && i.recitationNumber === proposal?.number && i.description === description.trim())
  const Icon = mode === "carry" ? ArrowLeftRight : Mic

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

        <div className="space-y-4">
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="text-xs text-muted-foreground">العمل الأصلي — {sourceSession && sessionLabel(sourceSession)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber} />
              <span className="font-medium">{item.description}</span>
              <WorkStatusBadge status={item.status} />
            </div>
          </div>

          {mode === "next" && proposal && (
            <div className="space-y-1.5">
              <Label htmlFor="wf-next-desc">العرضة التالية (العرضة {recitationOrdinal(proposal.number)})</Label>
              <Input id="wf-next-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wf-target">الحصة</Label>
            {options.length === 0 ? (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">لا توجد حصص قادمة متاحة لهذا الطالب</p>
            ) : (
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger id="wf-target" className="w-full">
                  <SelectValue placeholder="اختر من الحصص القادمة" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {options.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {sessionLabel(s)}
                      {programOf(data.programs, source.studentId, s.id) ? " · يوجد برنامج" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {target && !duplicate && (
              <p className="text-xs text-muted-foreground">سيُضاف العمل إلى برنامج هذه الحصة الموجود ({target.items.length} أعمال).</p>
            )}
          </div>

          {duplicate && (
            <Alert variant="destructive">
              <AlertDescription>
                {mode === "carry" ? "سبق نقل هذا العمل إلى هذه الحصة." : "هذه العرضة مبرمجة مسبقًا في هذه الحصة."} اختر حصة أخرى.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            disabled={!targetId || Boolean(duplicate) || !description.trim()}
            onClick={() =>
              onConfirm(targetId, {
                type: item.type,
                description: description.trim(),
                status: "NOT_EVALUATED",
                recitationNumber: mode === "next" ? proposal?.number : item.recitationNumber,
                // Only a continuation references the original item
                carriedFromItemId: mode === "carry" ? item.id : undefined,
              })
            }
          >
            تأكيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
