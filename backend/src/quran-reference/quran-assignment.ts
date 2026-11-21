/**
 * Structured Quranic assignments of «متابعة العمل» work items: validation per work type,
 * canonical verse range, workload snapshot and the default Arabic description.
 * Pure functions over the generated Quran reference (src/quran-reference/generated/).
 */
import { badRequest } from '../common/errors.js';
import { WorkAssignmentKind, WorkType } from '../generated/prisma/enums.js';
import { surahName } from '../memorization/surahs.js';
import {
  createEngine,
  hizbEquivalent,
  type QuranEngine,
} from './generated/engine.js';
import { ENGINE_SOURCE_SHA256 } from './generated/meta.js';
import { QALUN_TN_V1 } from './generated/qalun-tn-v1.data.js';
import type {
  HizbEquivalent,
  HizbsAndEighths,
  HizbsAndPages,
  Measure,
  VerseRef,
} from './generated/types.js';

/** Editions the server knows; new assignments always use ACTIVE_EDITION_ID. */
const EDITIONS = new Map<string, { engine: QuranEngine; sourceSha256: string }>(
  [
    [
      QALUN_TN_V1.editionId,
      {
        // Ranking stays off: nothing is authoritative until it is print-verified
        engine: createEngine(QALUN_TN_V1, {
          minStatusForRanking: 'print-verified',
        }),
        sourceSha256: QALUN_TN_V1.sourceSha256,
      },
    ],
  ],
);
export const ACTIVE_EDITION_ID = QALUN_TN_V1.editionId;

export const edition = (id: string = ACTIVE_EDITION_ID) => {
  const e = EDITIONS.get(id);
  if (!e) throw new Error(`unknown Mushaf edition ${id}`);
  return e;
};

/** What a client sends (references only — never a workload). */
export interface AssignmentInput {
  kind: WorkAssignmentKind;
  fromSurah?: number | null;
  fromAyah?: number | null;
  toSurah?: number | null;
  toAyah?: number | null;
  fromPage?: number | null;
  toPage?: number | null;
}

/** What is stored on the work item (the DB columns). */
export interface StoredAssignment {
  quranAssignmentKind: WorkAssignmentKind;
  quranEditionId: string;
  quranFromSurah: number;
  quranFromAyah: number;
  quranToSurah: number;
  quranToAyah: number;
  quranFromPage: number | null;
  quranToPage: number | null;
  quranWorkload: WorkloadSnapshot;
}

/** The workload stored with an item: the engine's result at save time, never a client value. */
export interface WorkloadSnapshot {
  schemaVersion: 1;
  editionId: string;
  datasetSha256: string;
  engineSha256: string;
  verses: number;
  startIndex: number;
  endIndex: number;
  surahs: { whole: number; touched: number };
  pages: Measure;
  juz: Measure;
  hizbs: Measure;
  quarters: Measure;
  eighths: Measure;
  /** Complete hizbs + remaining pages (actual boundaries; exact, bounded or unavailable) */
  hizbsAndPages: HizbsAndPages;
  /**
   * Complete hizbs + remaining eighths (the preferred display form). Additive: written for every
   * assignment resolved from now on; absent from snapshots stored before it (never backfilled).
   */
  hizbsAndEighths?: HizbsAndEighths;
  /**
   * Approximate size in hizbs, for display only (derived from `hizbs` + `eighths`). Stored with
   * every assignment resolved from now on; for older snapshots the API derives it at read time.
   */
  hizbEquivalent?: HizbEquivalent;
  dataStatus: string;
  /** False until the reference data used is print-verified: not for ranking students */
  authoritative: boolean;
}

const invalid = (code: string, message: string) => badRequest(code, message);
const FORMAT = 'WORK_ASSIGNMENT_FORMAT';
const REFERENCE = 'WORK_ASSIGNMENT_REFERENCE';
const REVERSED = 'WORK_ASSIGNMENT_REVERSED';

const given = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined;

/** Which formats each work type accepts. */
const ALLOWED: Record<WorkType, WorkAssignmentKind[]> = {
  MEMORIZATION: [WorkAssignmentKind.AYAH_RANGE, WorkAssignmentKind.PAGE_RANGE],
  REVISION: [WorkAssignmentKind.SURAH_RANGE],
  EXAM: [WorkAssignmentKind.SURAH_RANGE],
  RECITATION: [WorkAssignmentKind.SURAH_RANGE],
};

/**
 * Validates a structured assignment for a work type and returns its canonical, stored form.
 * Rules:
 *  - حفظ: AYAH_RANGE of one surah — no ayah: the whole surah (stored 1 → last verse); a starting
 *    ayah alone: that verse; both: the inclusive range — OR PAGE_RANGE (pages only; without an
 *    ending page: the starting page alone). Ranges are always stored complete (no empty end);
 *  - مراجعة / اختبار: SURAH_RANGE fromSurah → toSurah, ayahs optional (default: first / last verse);
 *  - عرضة: SURAH_RANGE of exactly one whole surah (no ayahs, no pages);
 *  - never two formats at once, never reversed, every verse / page checked against the edition.
 */
export function resolveAssignment(
  type: WorkType,
  input: AssignmentInput,
): StoredAssignment {
  const { engine, sourceSha256 } = edition();
  if (!ALLOWED[type].includes(input.kind))
    throw invalid(
      FORMAT,
      `صيغة التعيين ${input.kind} غير مقبولة لعمل من نوع ${type}`,
    );
  const hasPages = given(input.fromPage) || given(input.toPage);
  const hasSurahs = given(input.fromSurah) || given(input.toSurah);
  const hasAyahs = given(input.fromAyah) || given(input.toAyah);

  let from: VerseRef;
  let to: VerseRef;
  let pages: [number, number] | null = null;

  if (input.kind === WorkAssignmentKind.PAGE_RANGE) {
    if (hasSurahs || hasAyahs)
      throw invalid(
        FORMAT,
        'نطاق الصفحات لا يُجمع مع السور أو الآيات: اختر صيغة واحدة',
      );
    if (!given(input.fromPage)) throw invalid(FORMAT, 'حدّد الصفحة الأولى');
    // The ending page is optional: without it, the starting page alone
    const toPage = given(input.toPage) ? input.toPage : input.fromPage;
    if (input.fromPage > toPage)
      throw invalid(REVERSED, 'الصفحة الأولى بعد الصفحة الأخيرة');
    // Printed page numbers of the edition (2 … 604), never PDF page indices
    const range = engine.unitRange('page', input.fromPage, toPage);
    if (!range.ok)
      throw invalid(
        REFERENCE,
        `لا توجد هذه الصفحات في المصحف المعتمد (${input.fromPage}–${toPage})`,
      );
    ({ from, to } = range.value);
    pages = [input.fromPage, toPage];
  } else {
    if (hasPages)
      throw invalid(
        FORMAT,
        'نطاق السور أو الآيات لا يُجمع مع الصفحات: اختر صيغة واحدة',
      );
    // مراجعة / اختبار / عرضة: the ending surah is optional — omitted, the range is the starting
    // surah alone (stored canonically with toSurah = fromSurah, never left empty)
    const toSurahInput =
      input.kind === WorkAssignmentKind.SURAH_RANGE && !given(input.toSurah)
        ? input.fromSurah
        : input.toSurah;
    if (!given(input.fromSurah) || !given(toSurahInput))
      throw invalid(FORMAT, 'حدّد السورة الأولى والأخيرة');
    const fromSurah = input.fromSurah;
    const toSurah = toSurahInput;
    for (const s of [fromSurah, toSurah])
      if (!Number.isInteger(s) || s < 1 || s > 114)
        throw invalid(REFERENCE, `رقم سورة غير صحيح: ${s}`);
    if (fromSurah > toSurah)
      throw invalid(REVERSED, 'السورة الأولى بعد السورة الأخيرة');

    if (input.kind === WorkAssignmentKind.AYAH_RANGE) {
      if (fromSurah !== toSurah)
        throw invalid(FORMAT, 'الحفظ بالآيات يكون من سورة واحدة');
      // No ayah: the whole surah. An ending ayah needs its starting ayah.
      if (!given(input.fromAyah) && given(input.toAyah))
        throw invalid(FORMAT, 'حدّد الآية الأولى');
    }
    if (type === WorkType.RECITATION) {
      if (fromSurah !== toSurah)
        throw invalid(FORMAT, 'العرضة تكون لسورة واحدة كاملة');
      if (hasAyahs)
        throw invalid(FORMAT, 'العرضة تكون لسورة كاملة: لا تُحدَّد الآيات');
    }
    const last = engine.ayahCount(toSurah);
    from = { surah: fromSurah, ayah: input.fromAyah ?? 1 };
    // With precision and no ending surah, toAyah is a verse of the starting surah
    // حفظ: a starting ayah alone is that verse (the whole surah only when no ayah is given)
    const toAyah =
      input.kind === WorkAssignmentKind.AYAH_RANGE && given(input.fromAyah)
        ? (input.toAyah ?? input.fromAyah)
        : (input.toAyah ?? (last as number));
    to = { surah: toSurah, ayah: toAyah };
    for (const ref of [from, to]) {
      const { surah, ayah } = ref;
      if (!engine.isValid(ref))
        throw invalid(
          REFERENCE,
          `الآية ${ayah} غير موجودة في سورة ${surahName(surah) ?? surah}`,
        );
    }
    if (engine.compare(from, to) > 0)
      throw invalid(REVERSED, 'بداية النطاق بعد نهايته');
  }

  const workload = engine.workload({ from, to });
  if (!workload.ok) throw invalid(REFERENCE, workload.error.message);
  const w = workload.value;
  return {
    quranAssignmentKind: input.kind,
    quranEditionId: engine.editionId,
    quranFromSurah: from.surah,
    quranFromAyah: from.ayah,
    quranToSurah: to.surah,
    quranToAyah: to.ayah,
    quranFromPage: pages?.[0] ?? null,
    quranToPage: pages?.[1] ?? null,
    quranWorkload: {
      schemaVersion: 1,
      editionId: w.editionId,
      datasetSha256: sourceSha256,
      engineSha256: ENGINE_SOURCE_SHA256,
      verses: w.verses,
      startIndex: w.startIndex,
      endIndex: w.endIndex,
      surahs: w.surahs,
      pages: w.pages,
      juz: w.juz,
      hizbs: w.hizbs,
      quarters: w.quarters,
      eighths: w.eighths,
      hizbsAndPages: w.hizbsAndPages,
      hizbsAndEighths: w.hizbsAndEighths,
      hizbEquivalent: w.hizbEquivalent,
      dataStatus: w.dataStatus,
      authoritative: w.authoritative,
    },
  };
}

/**
 * A stored workload as served by the API. A snapshot saved before `hizbEquivalent` existed gets it
 * DERIVED from its own stored strict measures (`hizbs`, `eighths`) — pure arithmetic on what was
 * stored, nothing recomputed from the range, nothing written back. Without those measures the
 * snapshot is served as it is (the clients then fall back to pages).
 */
export function presentWorkload(
  stored: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!stored || 'hizbEquivalent' in stored) return stored;
  const { hizbs, eighths } = stored as { hizbs?: Measure; eighths?: Measure };
  if (!hizbs?.kind || !eighths?.kind) return stored;
  return { ...stored, hizbEquivalent: hizbEquivalent(hizbs, eighths) };
}

/** The columns of a free-text item (structured assignment removed). */
export const NO_ASSIGNMENT = {
  quranAssignmentKind: null,
  quranEditionId: null,
  quranFromSurah: null,
  quranFromAyah: null,
  quranToSurah: null,
  quranToAyah: null,
  quranFromPage: null,
  quranToPage: null,
} as const;

/** Same assignment (format, edition, canonical range, pages)? */
export function sameAssignment(
  a: Partial<Omit<StoredAssignment, 'quranWorkload'>> | null,
  b: Partial<Omit<StoredAssignment, 'quranWorkload'>> | null,
) {
  const keys = [
    'quranAssignmentKind',
    'quranEditionId',
    'quranFromSurah',
    'quranFromAyah',
    'quranToSurah',
    'quranToAyah',
    'quranFromPage',
    'quranToPage',
  ] as const;
  return keys.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
}

/**
 * Was `description` written by the server for this assignment — with today's wording, or with
 * the wording older items were saved with (a whole-surah حفظ was «سورة النصر: من الآية 1 إلى
 * الآية 3» before «سورة النصر كاملة»)? Such a text follows its assignment on edit.
 */
export function isGeneratedDescription(
  description: string,
  type: WorkType,
  a: Parameters<typeof describeAssignment>[1],
  recitationOrdinal: string | null,
): boolean {
  if (description === describeAssignment(type, a, recitationOrdinal))
    return true;
  const name = surahName(a.quranFromSurah) ?? String(a.quranFromSurah);
  return (
    a.quranAssignmentKind === WorkAssignmentKind.AYAH_RANGE &&
    type !== WorkType.RECITATION &&
    description ===
      `سورة ${name}: من الآية ${a.quranFromAyah} إلى الآية ${a.quranToAyah}`
  );
}

/**
 * Default Arabic description written by the server when a structured item is saved without one:
 *  حفظ  «سورة البقرة: من الآية 1 إلى الآية 20» / «من الصفحة 10 إلى الصفحة 12»
 *  مراجعة / اختبار «من سورة البقرة إلى سورة آل عمران» (ayahs shown when not whole surahs)
 *  عرضة «العرضة الثانية من سورة يس» (or «عرضة سورة يس» without a number)
 */
export function describeAssignment(
  type: WorkType,
  a: Pick<
    StoredAssignment,
    | 'quranAssignmentKind'
    | 'quranFromSurah'
    | 'quranFromAyah'
    | 'quranToSurah'
    | 'quranToAyah'
    | 'quranFromPage'
    | 'quranToPage'
    | 'quranEditionId'
  >,
  /** «الثانية» for a numbered عرضة (the caller's ordinal), null without a number */
  recitationOrdinal: string | null,
): string {
  const name = (s: number) => surahName(s) ?? String(s);
  if (a.quranAssignmentKind === WorkAssignmentKind.PAGE_RANGE)
    return a.quranFromPage === a.quranToPage
      ? `الصفحة ${a.quranFromPage}`
      : `من الصفحة ${a.quranFromPage} إلى الصفحة ${a.quranToPage}`;
  if (type === WorkType.RECITATION)
    return recitationOrdinal
      ? `العرضة ${recitationOrdinal} من سورة ${name(a.quranFromSurah)}`
      : `عرضة سورة ${name(a.quranFromSurah)}`;
  const last = edition(a.quranEditionId).engine.ayahCount(a.quranToSurah);
  // حفظ of a whole surah (stored as its full verse range)
  if (
    a.quranAssignmentKind === WorkAssignmentKind.AYAH_RANGE &&
    a.quranFromSurah === a.quranToSurah &&
    a.quranFromAyah === 1 &&
    a.quranToAyah === last
  )
    return `سورة ${name(a.quranFromSurah)} كاملة`;
  if (a.quranAssignmentKind === WorkAssignmentKind.AYAH_RANGE)
    return a.quranFromAyah === a.quranToAyah
      ? `سورة ${name(a.quranFromSurah)}: الآية ${a.quranFromAyah}`
      : `سورة ${name(a.quranFromSurah)}: من الآية ${a.quranFromAyah} إلى الآية ${a.quranToAyah}`;
  const wholeSurahs = a.quranFromAyah === 1 && a.quranToAyah === last;
  if (wholeSurahs)
    return a.quranFromSurah === a.quranToSurah
      ? `سورة ${name(a.quranFromSurah)}`
      : `من سورة ${name(a.quranFromSurah)} إلى سورة ${name(a.quranToSurah)}`;
  return `من سورة ${name(a.quranFromSurah)} الآية ${a.quranFromAyah} إلى سورة ${name(a.quranToSurah)} الآية ${a.quranToAyah}`;
}
