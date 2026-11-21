/**
 * «ترتيب حسب البرنامج» — an ADVISORY ordering of one session's students by the size of the work
 * assigned to them (Work Program 2.0, Phase 5B). Never a ranking: no scores, no positions, never
 * stored; the reference data is not print-verified yet.
 *
 * Policy (pure, deterministic, documented):
 *  1. Unit: PRINTED PAGES of the edition (the finest unit of the reference engine), taken from each
 *     item's stored workload snapshot — exact, or strictly bounded (lower < x < upper). The
 *     rounded «نحو 5 أحزاب» display is never used; no pages-per-hizb, no verse ratio.
 *  2. Primary size = the SUM over the student's حفظ, مراجعة and عرضة items (each item is its own
 *     teaching task: overlapping ranges in two items count twice; one item is counted once).
 *     Bounds add up (sum of lower bounds < total < sum of upper bounds). No weights per type.
 *  3. اختبار: a secondary size, used ONLY to order students whose primary sizes are equal.
 *  4. The assigned work only: evaluation results (statuses) are never read.
 *  5. Unknown: a student with ANY item whose size is unknown (free text, unavailable measure,
 *     another Mushaf edition) is "not comparable": kept, listed after the comparable students in
 *     their original order — never treated as zero or as less than the others.
 *  6. Order: comparable students by the MIDDLE of their interval (descending), then exam middle,
 *     then the original order. A numeric key makes the sort transitive and stable, and it never
 *     contradicts a certain comparison: if A is certainly larger than B, mid(A) > mid(B).
 *  7. Groups: consecutive students whose sizes cannot be told apart share a group ("comparable");
 *     a new group starts where the next student is CERTAINLY smaller than every member so far.
 */
import { WorkType } from '../generated/prisma/enums.js';

/** A size in pages: exact (lo = hi) or strictly between lo and hi. */
export interface SizeInterval {
  lo: number;
  hi: number;
  exact: boolean;
}

export type ProgramSize =
  | { kind: 'comparable'; primary: SizeInterval; exam: SizeInterval }
  | { kind: 'unavailable'; reason: 'FREE_TEXT' | 'UNMEASURED' | 'EDITION' };

export interface OrderInputItem {
  type: WorkType;
  /** The stored snapshot (JSON) — null for a free-text item */
  quranWorkload: unknown;
}

type Measure =
  | { kind: 'exact'; value: number }
  | { kind: 'bounded'; greaterThan: number; lessThan: number }
  | { kind: 'unavailable' };

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** One item's pages (from its snapshot), or why it cannot be compared. */
function itemPages(
  workload: unknown,
  editionId: string,
): SizeInterval | 'FREE_TEXT' | 'UNMEASURED' | 'EDITION' {
  if (!workload || typeof workload !== 'object') return 'FREE_TEXT';
  const w = workload as { editionId?: unknown; pages?: Measure };
  if (w.editionId !== editionId) return 'EDITION';
  const p = w.pages;
  if (p?.kind === 'exact' && isNum(p.value))
    return { lo: p.value, hi: p.value, exact: true };
  if (p?.kind === 'bounded' && isNum(p.greaterThan) && isNum(p.lessThan))
    return { lo: p.greaterThan, hi: p.lessThan, exact: false };
  return 'UNMEASURED';
}

const ZERO: SizeInterval = { lo: 0, hi: 0, exact: true };
const add = (a: SizeInterval, b: SizeInterval): SizeInterval => ({
  lo: a.lo + b.lo,
  hi: a.hi + b.hi,
  exact: a.exact && b.exact,
});

/** The program's sizes (policy 1–5). */
export function programSize(
  items: OrderInputItem[],
  editionId: string,
): ProgramSize {
  let primary = ZERO;
  let exam = ZERO;
  for (const item of items) {
    const pages = itemPages(item.quranWorkload, editionId);
    if (typeof pages === 'string')
      return { kind: 'unavailable', reason: pages };
    if (item.type === WorkType.EXAM) exam = add(exam, pages);
    else primary = add(primary, pages);
  }
  return { kind: 'comparable', primary, exam };
}

/** Is `a` CERTAINLY larger than `b`? (strict bounds: equal edges suffice unless both exact) */
export function certainlyLarger(a: SizeInterval, b: SizeInterval): boolean {
  return a.lo > b.hi || (a.lo === b.hi && !(a.exact && b.exact));
}

const mid = (s: SizeInterval) => (s.lo + s.hi) / 2;

export interface OrderedProgram<T> {
  value: T;
  size: ProgramSize;
  /** Group of comparable sizes (0, 1, …), null for a not-comparable program */
  group: number | null;
}

/** Policy 6–7: the advisory order of programs given in their ORIGINAL order. */
export function orderByWorkload<T>(
  programs: { value: T; items: OrderInputItem[] }[],
  editionId: string,
): OrderedProgram<T>[] {
  const sized = programs.map((p, index) => ({
    value: p.value,
    index,
    size: programSize(p.items, editionId),
  }));
  const comparable = sized
    .filter(
      (
        p,
      ): p is typeof p & {
        size: Extract<ProgramSize, { kind: 'comparable' }>;
      } => p.size.kind === 'comparable',
    )
    .sort(
      (a, b) =>
        mid(b.size.primary) - mid(a.size.primary) ||
        mid(b.size.exam) - mid(a.size.exam) ||
        a.index - b.index,
    );
  const out: OrderedProgram<T>[] = [];
  let group = 0;
  let members: SizeInterval[] = [];
  for (const p of comparable) {
    if (
      members.length &&
      members.every((m) => certainlyLarger(m, p.size.primary))
    ) {
      group++;
      members = [];
    }
    members.push(p.size.primary);
    out.push({ value: p.value, size: p.size, group });
  }
  for (const p of sized)
    if (p.size.kind === 'unavailable')
      out.push({ value: p.value, size: p.size, group: null });
  return out;
}
