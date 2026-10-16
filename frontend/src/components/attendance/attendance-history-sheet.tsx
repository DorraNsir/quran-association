"use client"

import { History, PencilLine, PlusCircle } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { QueryState } from "@/components/shared/query-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAttendanceHistory, type AttendanceChangeDto } from "@/lib/api/sessions"
import { formatDateTime } from "@/lib/format"
import type { StaffWorkspace } from "@/lib/workspace"

import { AttendanceStatusBadge } from "./attendance-badges"

/**
 * «سجل التعديلات»: every recording and correction of this session's
 * attendance (students and teachers), newest first — read-only, from the
 * API's append-only audit (the API checks who may read it).
 */
export function AttendanceHistoryButton({ sessionId, workspace }: { sessionId: string; workspace: StaffWorkspace }) {
  const [open, setOpen] = useState(false)
  const history = useAttendanceHistory(workspace, sessionId, open)
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <History />
        سجل التعديلات
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>سجل التعديلات</SheetTitle>
            <SheetDescription>كل تسجيل أو تعديل لحضور هذه الحصة، من الأحدث إلى الأقدم. لا يمكن تعديل هذا السجل.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <QueryState query={history}>
              {history.data && history.data.length === 0 ? (
                <EmptyState icon={History} title="لا توجد تعديلات بعد" description="يظهر هنا كل تسجيل أو تعديل للحضور ابتداءً من الآن." />
              ) : (
                <ol className="space-y-3">
                  {history.data?.map((change) => <ChangeItem key={change.id} change={change} />)}
                </ol>
              )}
            </QueryState>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function ChangeItem({ change }: { change: AttendanceChangeDto }) {
  const created = change.kind === "CREATED"
  const Icon = created ? PlusCircle : PencilLine
  const noteChanged = (change.previousNote ?? "") !== (change.newNote ?? "")
  return (
    <li className="rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-start gap-2">
        <Icon className={created ? "mt-0.5 size-4 shrink-0 text-primary" : "mt-0.5 size-4 shrink-0 text-warning"} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{change.subjectName}</span>
            <Badge variant="secondary" className="text-[0.7rem]">
              {change.subject === "TEACHER" ? "معلم" : "طالب"}
            </Badge>
            <span className="text-xs text-muted-foreground">{created ? "تسجيل أول" : "تعديل"}</span>
          </p>
          <p className="flex flex-wrap items-center gap-1.5">
            {change.previousStatus && (
              <>
                <AttendanceStatusBadge status={change.previousStatus} />
                <span aria-label="إلى" className="text-muted-foreground">←</span>
              </>
            )}
            <AttendanceStatusBadge status={change.newStatus} />
          </p>
          {noteChanged && (
            <p className="text-xs text-muted-foreground">
              الملاحظة: {change.previousNote ? `«${change.previousNote}» ← ` : ""}
              {change.newNote ? `«${change.newNote}»` : "حُذفت"}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {change.actorName} · {formatDateTime(change.createdAt)}
          </p>
        </div>
      </div>
    </li>
  )
}
