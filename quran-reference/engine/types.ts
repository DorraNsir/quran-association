/** Reliability of one reference entry, weakest → strongest (see the dataset's statusLegend). */
export type DataStatus = 'needs-review' | 'structurally-consistent' | 'cross-checked' | 'pdf-independent' | 'print-verified';
export const STATUS_RANK: readonly DataStatus[] = ['needs-review', 'structurally-consistent', 'cross-checked', 'pdf-independent', 'print-verified'];

/** The dataset file (data/qalun-tn-v1.json): only the fields the engine reads. `null` = not known. */
export interface ReferenceDataset {
  editionId: string;
  riwaya: string;
  totalAyahs: number;
  surahs: { surah: number; ayahCount: number | null; status: DataStatus }[];
  pageStarts: { page: number; surah: number | null; ayah: number | null; status: DataStatus }[];
  eighthStarts: { index: number; hizb: number; eighth: number; surah: number | null; ayah: number | null; status: DataStatus }[];
}

export interface VerseRef {
  surah: number;
  ayah: number;
}
export interface VerseRange {
  from: VerseRef;
  to: VerseRef;
}

export type Unit = 'page' | 'juz' | 'hizb' | 'quarter' | 'eighth';

/**
 * A workload in one unit.
 * - exact     : the range starts and ends exactly on unit boundaries; `value` whole units.
 * - bounded   : a unit is only partly assigned at the start and/or end. The true amount is
 *               strictly between `greaterThan` (whole units) and `lessThan` (units touched).
 *               Both bounds are exact facts; no assumption about verse length is made.
 * - unavailable: the reference data cannot answer (missing boundaries).
 * `estimate` is present only when explicitly requested; it is never used for comparisons.
 */
export type Measure =
  | { kind: 'exact'; value: number; touched: number; dataStatus: DataStatus }
  | {
      kind: 'bounded';
      greaterThan: number;
      lessThan: number;
      touched: number;
      partialAtStart: boolean;
      partialAtEnd: boolean;
      dataStatus: DataStatus;
      estimate?: { method: 'verse-share'; value: number; caveat: string };
    }
  | { kind: 'unavailable'; reason: string };

/**
 * The range as COMPLETE hizbs plus the remaining pages (actual boundaries of the edition):
 * - `hizbs`: hizbs lying entirely inside the range (always an exact count);
 * - `pages`: what is left before and after them, in pages — exact when those parts are whole
 *   pages, otherwise bounded (strictly between). Never fractional, never lines.
 * - unavailable when no hizb lies entirely inside the range (use `pages` then) or boundaries are unknown.
 */
export type HizbsAndPages =
  | { kind: 'exact'; hizbs: number; pages: number; dataStatus: DataStatus }
  | { kind: 'bounded'; hizbs: number; pages: { greaterThan: number; lessThan: number }; dataStatus: DataStatus }
  | { kind: 'unavailable'; reason: string };

/**
 * The range as COMPLETE hizbs plus the remaining eighths (أثمان) — the same complete hizbs as
 * HizbsAndPages, the remainder measured with the edition's eighth boundaries:
 * - `eighths`: exact when the parts before / after the hizbs are whole eighths, otherwise bounded
 *   (strictly between). Every hizb edge is an eighth edge, so only the range's two outer ends can
 *   cut an eighth: the bounds are at most 2 apart. Never fractional, never a verse-share ratio.
 * - unavailable when no hizb lies entirely inside the range or boundaries are unknown.
 */
export type HizbsAndEighths =
  | { kind: 'exact'; hizbs: number; eighths: number; dataStatus: DataStatus }
  | { kind: 'bounded'; hizbs: number; eighths: { greaterThan: number; lessThan: number }; dataStatus: DataStatus }
  | { kind: 'unavailable'; reason: string };

/**
 * Teacher-friendly SIZE of the range in hizbs — a presentation measure derived only from the strict
 * `hizbs` and `eighths` measures (actual eighth boundaries; no pages-per-hizb, no verse ratio):
 * - exact      : the range is exactly whole hizbs (strict boundaries: hizb 1 starts at al-Fatiha);
 * - approximate: the eighths bounds (lower < x < upper, or an exact count) all round to `hizbs`
 *                (multiples of `step`: ½ hizb below 10 hizbs, 1 hizb from 10);
 * - between    : the bounds straddle a rounding threshold — `from` and `to` are the two neighbours
 *                (never silently one of them);
 * - unavailable: an eighth boundary is unknown.
 * `eighths` keeps the bounds it was rounded from.
 */
export type HizbEquivalent =
  | { kind: 'exact'; hizbs: number }
  | { kind: 'approximate'; hizbs: number; step: 0.5 | 1; eighths: { greaterThan: number; lessThan: number } | { exact: number } }
  | { kind: 'between'; from: number; to: number; step: 0.5 | 1; eighths: { greaterThan: number; lessThan: number } }
  | { kind: 'unavailable'; reason: string };

export interface Workload {
  editionId: string;
  from: VerseRef;
  to: VerseRef;
  /** Position of the first / last verse in Mushaf order (1 … totalAyahs) */
  startIndex: number;
  endIndex: number;
  /** Always exact: the number of verses */
  verses: number;
  /** Whole surahs inside the range, and surahs touched */
  surahs: { whole: number; touched: number };
  pages: Measure;
  juz: Measure;
  hizbs: Measure;
  quarters: Measure;
  eighths: Measure;
  /** Complete hizbs + remaining pages (see HizbsAndPages) */
  hizbsAndPages: HizbsAndPages;
  /** Complete hizbs + remaining eighths (see HizbsAndEighths) */
  hizbsAndEighths: HizbsAndEighths;
  /** Approximate size in hizbs for display (see HizbEquivalent) */
  hizbEquivalent: HizbEquivalent;
  /** Weakest reliability among the reference entries this result depends on */
  dataStatus: DataStatus;
  /** True only when every entry used reaches the ranking policy's minimum status */
  authoritative: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: EngineError };
export type EngineError =
  | { code: 'INVALID_REFERENCE'; message: string; ref: unknown }
  | { code: 'REVERSED_RANGE'; message: string }
  | { code: 'INVALID_UNIT_NUMBER'; message: string }
  | { code: 'DATA_UNAVAILABLE'; message: string };

export interface EngineOptions {
  /** Minimum status for results used to RANK students (default: 'print-verified') */
  minStatusForRanking?: DataStatus;
}
export interface WorkloadOptions {
  /** Accept a range given end → start (it is put back in Mushaf order). Default: false (error). */
  allowReversed?: boolean;
  /** Add a verse-share estimate to bounded measures (approximate; never exact). Default: false. */
  includeEstimates?: boolean;
}
