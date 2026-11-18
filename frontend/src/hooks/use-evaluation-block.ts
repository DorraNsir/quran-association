"use client"

import { useAttendanceOpen } from "@/hooks/use-attendance-open"
import { evaluationBlockOf, type EvaluationBlock } from "@/lib/work-followup"
import type { WorkProgram } from "@/types/work-followup"

/**
 * Why «تقييم الأعمال» is closed for this program now (null: open) — the
 * server's verdict, re-checked against the clock while a lesson of today or
 * tomorrow waits for its start (the button turns on at the start minute,
 * without a refresh).
 */
export function useEvaluationBlock(program: Pick<WorkProgram, "session" | "evaluation">): EvaluationBlock | null {
  const { session } = program
  const { now } = useAttendanceOpen({ status: session.status, date: session.date, start: session.startTime })
  return evaluationBlockOf(program, now)
}
