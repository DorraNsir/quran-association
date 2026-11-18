import { useEffect, useState } from "react";

import { evaluationBlockOf, type EvaluationBlock } from "./work-model";
import type { WorkProgram } from "./work-types";

/** How often a waiting lesson re-checks the clock (the button turns on by itself). */
export const EVALUATION_TICK_MS = 15_000;

/**
 * Why «تقييم الأعمال» is closed for this program now (null: open) — the
 * server's verdict, re-checked against the platform clock while the lesson
 * waits for its start, so the button opens at the start minute without a
 * refresh. No timer otherwise.
 */
export function useEvaluationBlock(
  program: Pick<WorkProgram, "session" | "evaluation"> | undefined,
  timeZone: string | undefined,
): EvaluationBlock | null {
  const [now, setNow] = useState(() => new Date());
  const block = program ? evaluationBlockOf(program, timeZone, now) : null;
  const waiting = block === "NOT_STARTED";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(new Date()), EVALUATION_TICK_MS);
    return () => clearInterval(timer);
  }, [waiting]);
  return block;
}
