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
