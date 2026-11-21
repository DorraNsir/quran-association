// GENERATED copy of quran-reference/clients/work-assignment.ts (scripts/sync-clients.mjs) — do not edit; change the source and re-run.
/**
 * Structured Quranic assignments of «متابعة العمل» — CLIENT rules shared by the web and mobile apps.
 *
 * ONE source (this file), copied into both apps by quran-reference/scripts/sync-clients.mjs (drift
 * tests in each app). It mirrors the backend contract (backend/src/quran-reference/quran-assignment.ts):
 * the server stays the authority — it re-validates everything and computes the workload; this module
 * only guides the form, builds the request and FORMATS what the server returned. It never computes
 * a workload.
 */
import { QURAN_REFERENCE } from './quran-reference.data';

export type WorkType = 'MEMORIZATION' | 'REVISION' | 'RECITATION' | 'EXAM';
export type AssignmentKind = 'AYAH_RANGE' | 'PAGE_RANGE' | 'SURAH_RANGE';

/** `assignment` of a work item in API responses (null: a free-text item). */
export interface WorkAssignment {
  kind: AssignmentKind;
  editionId: string;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  fromPage: number | null;
  toPage: number | null;
}

/**
 * `assignment` in create / edit requests: references only, never a workload.
 * حفظ: AYAH_RANGE with only `fromSurah` = the whole surah; with `fromAyah` and no `toAyah` = that
 * verse alone; PAGE_RANGE without `toPage` = that page alone (the server resolves the same).
 */
export interface AssignmentPayload {
  kind: AssignmentKind;
  fromSurah?: number;
  fromAyah?: number;
  toSurah?: number;
  toAyah?: number;
  fromPage?: number;
  toPage?: number;
}

/** One unit of the server's workload (backend engine Measure, without estimates). */
export type Measure =
  | { kind: 'exact'; value: number; touched: number; dataStatus: string }
  | { kind: 'bounded'; greaterThan: number; lessThan: number; touched: number; partialAtStart: boolean; partialAtEnd: boolean; dataStatus: string }
  | { kind: 'unavailable'; reason: string };

/**
 * Complete hizbs + remaining pages (backend engine HizbsAndPages): the hizb count is exact; the
 * remaining pages are exact or bounded. Absent from workloads stored before it existed.
 */
export type HizbsAndPages =
  | { kind: 'exact'; hizbs: number; pages: number; dataStatus: string }
  | { kind: 'bounded'; hizbs: number; pages: { greaterThan: number; lessThan: number }; dataStatus: string }
  | { kind: 'unavailable'; reason: string };

/**
 * Complete hizbs + remaining eighths (backend engine HizbsAndEighths): the same complete hizbs,
 * the remainder in eighths — exact or bounded (at most 2 apart). Absent from workloads stored
 * before it existed.
 */
export type HizbsAndEighths =
  | { kind: 'exact'; hizbs: number; eighths: number; dataStatus: string }
  | { kind: 'bounded'; hizbs: number; eighths: { greaterThan: number; lessThan: number }; dataStatus: string }
  | { kind: 'unavailable'; reason: string };

/**
 * Approximate size in hizbs (backend engine HizbEquivalent), for display: exact for whole hizbs,
 * otherwise rounded by the server from the strict eighths bounds (½ hizb below 10 hizbs, 1 hizb
 * from 10), or `between` two neighbours when the bounds straddle a rounding threshold.
 */
export type HizbEquivalent =
  | { kind: 'exact'; hizbs: number }
  | { kind: 'approximate'; hizbs: number; step: number; eighths: unknown }
  | { kind: 'between'; from: number; to: number; step: number; eighths: unknown }
  | { kind: 'unavailable'; reason: string };

/** `workload` of a work item in API responses (computed and stored by the server). */
export interface WorkloadSnapshot {
  editionId: string;
  verses: number;
  surahs: { whole: number; touched: number };
  pages: Measure;
  juz: Measure;
  hizbs: Measure;
  quarters: Measure;
  eighths: Measure;
  /** Absent from items saved before this measure existed (their snapshot is never recomputed) */
  hizbsAndPages?: HizbsAndPages;
  /** Absent from items saved before this measure existed (their snapshot is never recomputed) */
  hizbsAndEighths?: HizbsAndEighths;
  /** Served for every snapshot (derived by the server for older ones); optional for safety */
  hizbEquivalent?: HizbEquivalent;
  dataStatus: string;
  /** False until the reference data is verified on the printed Mushaf: never a ranking basis */
  authoritative: boolean;
}

// ───────────────────────── reference data ─────────────────────────

export const EDITION_ID = QURAN_REFERENCE.editionId;
export const FIRST_PAGE = QURAN_REFERENCE.firstPage;
export const LAST_PAGE = QURAN_REFERENCE.lastPage;

/** Number of verses of a surah in THIS edition (Kufan count), 0 for an invalid number. */
export function ayahCount(surah: number): number {
  return Number.isInteger(surah) && surah >= 1 && surah <= 114 ? (QURAN_REFERENCE.ayahCounts[surah - 1] ?? 0) : 0;
}

/** First verse of a printed page of this edition (2 … 604), null outside. */
export function pageStart(page: number): { surah: number; ayah: number } | null {
  const p = QURAN_REFERENCE.pageStarts[page - FIRST_PAGE];
  return Number.isInteger(page) && p ? { surah: p[0], ayah: p[1] } : null;
}

/** Last verse of a printed page (the verse before the next page starts). */
export function pageEnd(page: number): { surah: number; ayah: number } | null {
  if (!pageStart(page)) return null;
  const next = pageStart(page + 1);
  if (!next) return { surah: 114, ayah: ayahCount(114) };
  return next.ayah > 1 ? { surah: next.surah, ayah: next.ayah - 1 } : { surah: next.surah - 1, ayah: ayahCount(next.surah - 1) };
}

// ───────────────────────── form draft ─────────────────────────

/**
 * How an item is entered: free text, or one structured format.
 *  wholeSurah / ayahs / pages : حفظ  ·  surahs : مراجعة / اختبار  ·  surah : عرضة (one whole surah)
 * A حفظ of a whole surah is stored as the verse range 1 → last verse of that surah (AYAH_RANGE):
 * such a range always re-opens as «سورة كاملة» — the same verses, the same workload.
 */
export type AssignmentMode = 'free' | 'wholeSurah' | 'ayahs' | 'pages' | 'surahs' | 'surah';

export interface AssignmentDraft {
  mode: AssignmentMode;
  fromSurah: number | null;
  toSurah: number | null;
  /** Typed text (validated, never coerced silently) */
  fromAyah: string;
  toAyah: string;
  fromPage: string;
  toPage: string;
  /** مراجعة / اختبار: ayah-level precision on */
  precise: boolean;
}

/** Structured modes of a type. */
export function modesFor(type: WorkType): AssignmentMode[] {
  if (type === 'MEMORIZATION') return ['wholeSurah', 'ayahs', 'pages'];
  if (type === 'RECITATION') return ['surah'];
  return ['surahs'];
}

/** The mode a new item starts in (حفظ: by verses, the most frequent). */
const DEFAULT_MODE: Record<WorkType, AssignmentMode> = { MEMORIZATION: 'ayahs', REVISION: 'surahs', EXAM: 'surahs', RECITATION: 'surah' };

export function emptyDraft(type: WorkType): AssignmentDraft {
  return { mode: DEFAULT_MODE[type], fromSurah: null, toSurah: null, fromAyah: '', toAyah: '', fromPage: '', toPage: '', precise: false };
}

/**
 * Modes a form offers for an item. New items: structured only. 'free' is offered only for an item
 * that was SAVED as free text (legacy), so it can be kept as it is; converting it is an explicit
 * choice of a structured mode, and a structured item never goes back to free text.
 */
export function modesForItem(type: WorkType, legacyFreeText: boolean): AssignmentMode[] {
  return legacyFreeText ? [...modesFor(type), 'free'] : modesFor(type);
}

/** Nothing chosen yet in the structured fields (whatever the format). */
export function isBlankDraft(d: AssignmentDraft): boolean {
  return !d.fromSurah && !d.toSurah && !d.fromAyah.trim() && !d.toAyah.trim() && !d.fromPage.trim() && !d.toPage.trim();
}

/** Free text (a legacy item, or a teacher's choice). */
export const freeDraft = (type: WorkType): AssignmentDraft => ({ ...emptyDraft(type), mode: 'free' });

/** The form state of a saved item (edit): its stored references, or free text. */
export function draftFromAssignment(type: WorkType, a: WorkAssignment | null): AssignmentDraft {
  if (!a) return freeDraft(type);
  const base = emptyDraft(type);
  // A single page / verse re-opens with its optional end left empty (the same assignment)
  if (a.kind === 'PAGE_RANGE')
    return { ...base, mode: 'pages', fromPage: String(a.fromPage ?? ''), toPage: a.toPage === a.fromPage ? '' : String(a.toPage ?? '') };
  const whole = a.fromAyah === 1 && a.toAyah === ayahCount(a.toSurah);
  if (a.kind === 'AYAH_RANGE')
    return whole && a.fromSurah === a.toSurah
      ? { ...base, mode: 'wholeSurah', fromSurah: a.fromSurah, toSurah: a.fromSurah }
      : { ...base, mode: 'ayahs', fromSurah: a.fromSurah, toSurah: a.toSurah, fromAyah: String(a.fromAyah), toAyah: a.toAyah === a.fromAyah ? '' : String(a.toAyah) };
  if (type === 'RECITATION') return { ...base, mode: 'surah', fromSurah: a.fromSurah, toSurah: a.toSurah };
  // A single-surah range re-opens with the optional ending surah left empty
  const toSurah = a.toSurah === a.fromSurah ? null : a.toSurah;
  return whole
    ? { ...base, mode: 'surahs', fromSurah: a.fromSurah, toSurah }
    : { ...base, mode: 'surahs', fromSurah: a.fromSurah, toSurah, precise: true, fromAyah: String(a.fromAyah), toAyah: String(a.toAyah) };
}

/**
 * After a change of work type: keep what still applies (the surah), drop what the new type does
 * not accept (pages, ayahs of a recitation). Free text stays free text.
 */
export function adaptDraft(draft: AssignmentDraft, type: WorkType): AssignmentDraft {
  if (draft.mode === 'free') return draft;
  const next = emptyDraft(type);
  const surah = draft.fromSurah;
  if (next.mode === 'ayahs' || next.mode === 'surah') {
    // حفظ of a whole surah stays a whole surah
    const mode = type === 'MEMORIZATION' && (draft.mode === 'surah' || draft.mode === 'wholeSurah') ? 'wholeSurah' : next.mode;
    return { ...next, mode, fromSurah: surah, toSurah: surah };
  }
  // مراجعة / اختبار: the ending surah is optional — kept only when it really differs
  return { ...next, fromSurah: surah, toSurah: draft.toSurah && draft.toSurah !== surah ? draft.toSurah : null };
}

/** Change the surah of a single-surah mode: the verse fields are cleared when they no longer fit. */
export function withSurah(draft: AssignmentDraft, surah: number): AssignmentDraft {
  const fits = (v: string) => v === '' || Number(v) <= ayahCount(surah);
  return {
    ...draft,
    fromSurah: surah,
    toSurah: surah,
    fromAyah: fits(draft.fromAyah) ? draft.fromAyah : '',
    toAyah: fits(draft.toAyah) ? draft.toAyah : '',
  };
}

// ───────────────────────── validation ─────────────────────────

export type AssignmentErrorCode =
  | 'SURAH_REQUIRED'
  | 'SURAHS_REQUIRED'
  | 'AYAHS_REQUIRED'
  | 'AYAH_INVALID'
  | 'AYAH_REVERSED'
  | 'SURAH_REVERSED'
  | 'RANGE_REVERSED'
  | 'PAGES_REQUIRED'
  | 'PAGE_INVALID'
  | 'PAGE_REVERSED'
  | 'MODE_NOT_ALLOWED'
  | 'STRUCTURE_REQUIRED';

export interface AssignmentError {
  code: AssignmentErrorCode;
  message: string;
  /** The field to highlight */
  field: 'fromSurah' | 'toSurah' | 'fromAyah' | 'toAyah' | 'fromPage' | 'toPage' | 'mode';
}

const whole = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
const err = (code: AssignmentErrorCode, field: AssignmentError['field'], message: string): AssignmentError => ({ code, field, message });

/** The first problem of a draft for a type, or null when it may be sent (free text: always null). */
export function validateDraft(type: WorkType, d: AssignmentDraft): AssignmentError | null {
  if (d.mode === 'free') return null;
  if (!modesFor(type).includes(d.mode)) return err('MODE_NOT_ALLOWED', 'mode', 'هذه الصيغة غير متاحة لهذا النوع من الأعمال');
  if (d.mode === 'pages') {
    // The ending page is optional: without it, the starting page alone
    const f = whole(d.fromPage), t = d.toPage.trim() === '' ? f : whole(d.toPage);
    if (f === null) return err('PAGES_REQUIRED', 'fromPage', d.fromPage.trim() === '' ? 'حدّد الصفحة الأولى' : 'رقم الصفحة عدد صحيح');
    if (t === null) return err('PAGE_INVALID', 'toPage', 'رقم الصفحة عدد صحيح');
    const bad = (p: number) => p < FIRST_PAGE || p > LAST_PAGE;
    if (bad(f) || bad(t)) return err('PAGE_INVALID', bad(f) ? 'fromPage' : 'toPage', `صفحات القرآن في هذا المصحف من ${FIRST_PAGE} إلى ${LAST_PAGE}`);
    if (f > t) return err('PAGE_REVERSED', 'toPage', 'الصفحة الأولى بعد الصفحة الأخيرة');
    return null;
  }
  if (d.mode === 'ayahs' || d.mode === 'surah' || d.mode === 'wholeSurah') {
    if (!d.fromSurah) return err('SURAH_REQUIRED', 'fromSurah', 'اختر السورة');
    if (d.mode !== 'ayahs') return null;
  } else {
    if (!d.fromSurah) return err('SURAHS_REQUIRED', 'fromSurah', 'اختر سورة البداية');
    // The ending surah is optional: without it, the starting surah alone
    if (d.toSurah && d.fromSurah > d.toSurah) return err('SURAH_REVERSED', 'toSurah', 'سورة البداية بعد سورة النهاية');
    if (!d.precise) return null;
  }
  const fromS = d.fromSurah;
  const toS = d.mode === 'ayahs' ? fromS : (d.toSurah ?? fromS);
  const memo = d.mode === 'ayahs';
  // حفظ: the starting verse is required, the ending one optional (without it: that verse alone)
  if (memo && d.fromAyah.trim() === '') return err('AYAHS_REQUIRED', 'fromAyah', 'حدّد الآية الأولى');
  const fa = d.fromAyah.trim() === '' ? 1 : whole(d.fromAyah);
  const ta = d.toAyah.trim() === '' ? (memo ? fa : ayahCount(toS)) : whole(d.toAyah);
  if (fa === null || ta === null) {
    const empty = d.fromAyah.trim() === '' || d.toAyah.trim() === '';
    return err(empty ? 'AYAHS_REQUIRED' : 'AYAH_INVALID', fa === null ? 'fromAyah' : 'toAyah', empty ? 'حدّد الآية الأولى والأخيرة' : 'رقم الآية عدد صحيح');
  }
  if (fa < 1 || fa > ayahCount(fromS)) return err('AYAH_INVALID', 'fromAyah', `آيات هذه السورة من 1 إلى ${ayahCount(fromS)}`);
  if (ta < 1 || ta > ayahCount(toS)) return err('AYAH_INVALID', 'toAyah', `آيات هذه السورة من 1 إلى ${ayahCount(toS)}`);
  if (fromS === toS && fa > ta) return err(d.mode === 'ayahs' ? 'AYAH_REVERSED' : 'RANGE_REVERSED', 'toAyah', 'الآية الأولى بعد الآية الأخيرة');
  return null;
}

/**
 * validateDraft for a form item: free text is accepted only for a legacy free-text item; a new (or
 * structured) item must carry valid Quranic references — never a silent fallback to free text.
 */
export function validateItemDraft(type: WorkType, d: AssignmentDraft, legacyFreeText: boolean): AssignmentError | null {
  if (d.mode === 'free' && !legacyFreeText)
    return err('STRUCTURE_REQUIRED', 'mode', 'حدّد العمل من المصحف: السورة والآيات أو الصفحات');
  return validateDraft(type, d);
}

/** The request `assignment` of a valid draft (null for free text). Call validateDraft first. */
export function toPayload(d: AssignmentDraft): AssignmentPayload | null {
  const n = (v: string) => Number(v.trim());
  switch (d.mode) {
    case 'free':
      return null;
    // Only the fields of the current mode: values typed in another mode are never sent
    case 'pages':
      return { kind: 'PAGE_RANGE', fromPage: n(d.fromPage), ...(d.toPage.trim() ? { toPage: n(d.toPage) } : {}) };
    case 'wholeSurah':
      return { kind: 'AYAH_RANGE', fromSurah: d.fromSurah as number, toSurah: d.fromSurah as number };
    case 'ayahs':
      return {
        kind: 'AYAH_RANGE',
        fromSurah: d.fromSurah as number,
        fromAyah: n(d.fromAyah),
        toSurah: d.fromSurah as number,
        ...(d.toAyah.trim() ? { toAyah: n(d.toAyah) } : {}),
      };
    case 'surah':
      return { kind: 'SURAH_RANGE', fromSurah: d.fromSurah as number, toSurah: d.fromSurah as number };
    case 'surahs':
      return {
        kind: 'SURAH_RANGE',
        fromSurah: d.fromSurah as number,
        // No ending surah: the starting surah alone, sent explicitly (the canonical form)
        toSurah: d.toSurah ?? (d.fromSurah as number),
        ...(d.precise && d.fromAyah.trim() ? { fromAyah: n(d.fromAyah) } : {}),
        ...(d.precise && d.toAyah.trim() ? { toAyah: n(d.toAyah) } : {}),
      };
  }
}

/**
 * The canonical range a payload stands for (the server derives the same): used to tell whether an
 * edited item's assignment really changed. Null for an impossible payload.
 */
export function canonicalOf(p: AssignmentPayload): Omit<WorkAssignment, 'editionId'> | null {
  if (p.kind === 'PAGE_RANGE') {
    const toPage = p.toPage ?? p.fromPage; // no ending page: the starting page alone
    const a = pageStart(p.fromPage ?? 0), z = pageEnd(toPage ?? 0);
    return a && z ? { kind: p.kind, fromSurah: a.surah, fromAyah: a.ayah, toSurah: z.surah, toAyah: z.ayah, fromPage: p.fromPage ?? null, toPage: toPage ?? null } : null;
  }
  if (p.kind === 'AYAH_RANGE') {
    if (!p.fromSurah) return null;
    const toSurah = p.toSurah ?? p.fromSurah;
    // no verse: the whole surah; a starting verse alone: that verse
    if (p.fromAyah === undefined && p.toAyah === undefined)
      return { kind: p.kind, fromSurah: p.fromSurah, fromAyah: 1, toSurah, toAyah: ayahCount(toSurah), fromPage: null, toPage: null };
    if (p.fromAyah === undefined) return null;
    return { kind: p.kind, fromSurah: p.fromSurah, fromAyah: p.fromAyah, toSurah, toAyah: p.toAyah ?? p.fromAyah, fromPage: null, toPage: null };
  }
  if (!p.fromSurah) return null;
  // The server's rule: a surah range without an ending surah is the starting surah alone
  const toSurah = p.toSurah ?? (p.kind === 'SURAH_RANGE' ? p.fromSurah : undefined);
  if (!toSurah) return null;
  return { kind: p.kind, fromSurah: p.fromSurah, fromAyah: p.fromAyah ?? 1, toSurah, toAyah: p.toAyah ?? ayahCount(toSurah), fromPage: null, toPage: null };
}

/** Does a payload (or free text: null) leave a saved assignment unchanged? */
export function sameAssignment(saved: WorkAssignment | null, payload: AssignmentPayload | null): boolean {
  if (!saved || !payload) return !saved && !payload;
  const c = canonicalOf(payload);
  return Boolean(
    c &&
      c.kind === saved.kind &&
      c.fromSurah === saved.fromSurah &&
      c.fromAyah === saved.fromAyah &&
      c.toSurah === saved.toSurah &&
      c.toAyah === saved.toAyah &&
      c.fromPage === saved.fromPage &&
      c.toPage === saved.toPage,
  );
}

// ───────────────────────── display ─────────────────────────

/**
 * The server's default description of a structured item — the SAME words as the backend
 * (describeAssignment), so a client can tell a teacher's own text from the default one.
 */
export function defaultDescription(
  type: WorkType,
  a: WorkAssignment,
  surahName: (n: number) => string,
  /** «الثانية» for a numbered عرضة, null otherwise */
  recitationOrdinal: string | null,
): string {
  if (a.kind === 'PAGE_RANGE')
    return a.fromPage === a.toPage ? `الصفحة ${a.fromPage}` : `من الصفحة ${a.fromPage} إلى الصفحة ${a.toPage}`;
  if (type === 'RECITATION')
    return recitationOrdinal ? `العرضة ${recitationOrdinal} من سورة ${surahName(a.fromSurah)}` : `عرضة سورة ${surahName(a.fromSurah)}`;
  if (a.kind === 'AYAH_RANGE' && a.fromSurah === a.toSurah && a.fromAyah === 1 && a.toAyah === ayahCount(a.toSurah))
    return `سورة ${surahName(a.fromSurah)} كاملة`;
  if (a.kind === 'AYAH_RANGE')
    return a.fromAyah === a.toAyah
      ? `سورة ${surahName(a.fromSurah)}: الآية ${a.fromAyah}`
      : `سورة ${surahName(a.fromSurah)}: من الآية ${a.fromAyah} إلى الآية ${a.toAyah}`;
  if (a.fromAyah === 1 && a.toAyah === ayahCount(a.toSurah))
    return a.fromSurah === a.toSurah ? `سورة ${surahName(a.fromSurah)}` : `من سورة ${surahName(a.fromSurah)} إلى سورة ${surahName(a.toSurah)}`;
  return `من سورة ${surahName(a.fromSurah)} الآية ${a.fromAyah} إلى سورة ${surahName(a.toSurah)} الآية ${a.toAyah}`;
}

/**
 * Is `description` the server's default wording of this assignment — today's, or the wording an
 * older item was saved with («سورة النصر: من الآية 1 إلى الآية 3» before «سورة النصر كاملة»)?
 * Such a text is not the teacher's own and is not shown twice.
 */
export function isDefaultDescription(
  description: string,
  type: WorkType,
  a: WorkAssignment,
  surahName: (n: number) => string,
  recitationOrdinal: string | null,
): boolean {
  if (description === defaultDescription(type, a, surahName, recitationOrdinal)) return true;
  return a.kind === 'AYAH_RANGE' && type !== 'RECITATION' && description === `سورة ${surahName(a.fromSurah)}: من الآية ${a.fromAyah} إلى الآية ${a.toAyah}`;
}

/**
 * One-line Arabic summary of an assignment («سورة البقرة: من الآية 6 إلى الآية 20», «سورة الرحمن» …);
 * a page range also names the verses it covers in this edition.
 */
export function assignmentSummary(type: WorkType, a: WorkAssignment, surahName: (n: number) => string): string {
  const main = defaultDescription(type, a, surahName, null);
  if (type === 'RECITATION') return `سورة ${surahName(a.fromSurah)}`;
  if (a.kind !== 'PAGE_RANGE') return main;
  return `${main} (${surahName(a.fromSurah)} ${a.fromAyah} – ${surahName(a.toSurah)} ${a.toAyah})`;
}

/**
 * Arabic count forms per unit:
 *  [one, two (nominative), two (after a preposition: «بين» / «أقل من»), plural 3–10, singular 11+]
 */
type UnitForms = [one: string, two: string, twoGenitive: string, few: string, many: string];
const UNITS = {
  verses: ['آية واحدة', 'آيتان', 'آيتين', 'آيات', 'آية'],
  pages: ['صفحة واحدة', 'صفحتان', 'صفحتين', 'صفحات', 'صفحة'],
  juz: ['جزء واحد', 'جزءان', 'جزأين', 'أجزاء', 'جزءًا'],
  hizbs: ['حزب واحد', 'حزبان', 'حزبين', 'أحزاب', 'حزبًا'],
  quarters: ['ربع حزب واحد', 'ربعا حزب', 'ربعي حزب', 'أرباع', 'ربعًا'],
  eighths: ['ثمن واحد', 'ثمنان', 'ثمنين', 'أثمان', 'ثمنًا'],
} satisfies Record<string, UnitForms>;
export type WorkloadUnit = keyof typeof UNITS;

/**
 * «صفحة واحدة», «صفحتان», «3 صفحات», «11 صفحة». `afterPreposition` gives the form used after «بين»
 * or «أقل من» (only the dual changes: «صفحتين»).
 */
export function countLabel(n: number, unit: WorkloadUnit, afterPreposition = false): string {
  const [one, two, twoGenitive, few, many] = UNITS[unit];
  if (n === 1) return one;
  if (n === 2) return afterPreposition ? twoGenitive : two;
  return `${n} ${n >= 3 && n <= 10 ? few : many}`;
}

/** The bare singular noun («صفحة», «ثمن», «ربع حزب»): used for 1 after «بين» / «أقل من». */
const bare = (unit: WorkloadUnit) => UNITS[unit][0].replace(/ واحدة?$/, '');

export type Precision = 'exact' | 'bounded' | 'approximate' | 'estimated' | 'unavailable';

/**
 * Strictly between two whole counts, the unit said once when both are numbers:
 *  «أقل من صفحة» · «أقل من صفحتين» · «بين صفحة وصفحتين» · «بين صفحتين و3 صفحات» · «بين 5 و6 صفحات» ·
 *  «بين 12 و14 صفحة». The bounds keep their meaning: never shown as one exact-looking value.
 */
function boundedText(greaterThan: number, lessThan: number, unit: WorkloadUnit): string {
  const upper = lessThan === 1 ? bare(unit) : countLabel(lessThan, unit, true);
  if (greaterThan === 0) return `أقل من ${upper}`;
  const lower = greaterThan === 1 ? bare(unit) : greaterThan === 2 ? countLabel(2, unit, true) : String(greaterThan);
  return `بين ${lower} و${upper}`;
}

/**
 * A measure as concise Arabic text, never more precise than the server said:
 *  exact     → «3 صفحات»
 *  bounded   → «بين صفحتين و3 صفحات» (strictly between) · «أقل من صفحة»
 *  estimated → the bounded text, then «(2.4 تقريبًا)» — only when a measure carries an estimate
 *  unavailable → «غير متاح» (callers leave it out: no number is invented)
 * Partial pages are only ever bounded: the reference has no line positions.
 */
export function formatMeasure(
  m: Measure & { estimate?: { value: number } },
  unit: WorkloadUnit,
): { text: string; precision: Precision } {
  if (m.kind === 'exact') return { text: countLabel(m.value, unit), precision: 'exact' };
  if (m.kind === 'unavailable') return { text: 'غير متاح', precision: 'unavailable' };
  const range = boundedText(m.greaterThan, m.lessThan, unit);
  if (m.estimate) {
    const approx = (Math.round(m.estimate.value * 10) / 10).toLocaleString('en-US');
    return { text: `${range} (${approx} تقريبًا)`, precision: 'estimated' };
  }
  return { text: range, precision: 'bounded' };
}

/** Verse counts are shown for short assignments only: 1 ≤ verses < 100 (hidden from 100). */
export const VERSE_COUNT_LIMIT = 100;
export const showsVerseCount = (verses: number) => Number.isInteger(verses) && verses >= 1 && verses < VERSE_COUNT_LIMIT;

/** From this size (in hizbs) an assignment is shown in hizbs; below it, in pages. */
export const HIZB_DISPLAY_FROM = 1;

/**
 * A count of hizbs in steps of ½: «نصف حزب», «حزب واحد», «حزب ونصف», «حزبان ونصف», «3 أحزاب ونصف»,
 * «16 حزبًا». `afterPreposition` after «من» / «إلى» (the dual: «حزبين»).
 */
export function hizbAmount(h: number, afterPreposition = false): string {
  const whole = Math.floor(h);
  const half = h - whole === 0.5;
  if (!half) return countLabel(whole, 'hizbs', afterPreposition);
  if (whole === 0) return 'نصف حزب';
  if (whole === 1) return 'حزب ونصف';
  return `${countLabel(whole, 'hizbs', afterPreposition)} ونصف`;
}

/**
 * The size in hizbs, when the assignment reaches HIZB_DISPLAY_FROM (for every possible amount):
 *  exact       «حزبان» — whole hizbs only, no «تقريبًا»
 *  approximate «5 أحزاب تقريبًا» · «حزب ونصف تقريبًا» · «حزبان تقريبًا» · «16 حزبًا تقريبًا»
 *  between     «من حزب ونصف إلى حزبين تقريبًا» — the bounds straddle a rounding threshold
 * Null below it, when absent or unavailable (the page measure is used instead).
 */
export function formatHizbEquivalent(h: HizbEquivalent | undefined): { text: string; precision: Precision } | null {
  if (!h || h.kind === 'unavailable') return null;
  if (h.kind === 'exact') return h.hizbs >= HIZB_DISPLAY_FROM ? { text: countLabel(h.hizbs, 'hizbs'), precision: 'exact' } : null;
  if (h.kind === 'approximate')
    return h.hizbs >= HIZB_DISPLAY_FROM ? { text: `${hizbAmount(h.hizbs)} تقريبًا`, precision: 'approximate' } : null;
  return h.from >= HIZB_DISPLAY_FROM
    ? { text: `من ${hizbAmount(h.from, true)} إلى ${hizbAmount(h.to, true)} تقريبًا`, precision: 'approximate' }
    : null;
}

export interface WorkloadLine {
  /** 'hizbEquivalent' when the size is given in hizbs */
  unit: WorkloadUnit | 'hizbEquivalent';
  text: string;
  precision: Precision;
}

/** The size: in hizbs from one hizb (see formatHizbEquivalent), otherwise the page measure. */
function sizeLine(w: WorkloadSnapshot): WorkloadLine {
  const hizbs = formatHizbEquivalent(w.hizbEquivalent);
  return hizbs ? { unit: 'hizbEquivalent', ...hizbs } : { unit: 'pages', ...formatMeasure(w.pages, 'pages') };
}

/**
 * The workload of an item (server values only), unavailable parts left out:
 *  - `lines`: the verse count when 1 ≤ verses < 100, then the size (see sizeLine). A recitation
 *    (عرضة) shows its verse count alone, or its size once the verse count is hidden;
 *  - `hint`: the total page count as a secondary hint — only when the page measure is EXACT and
 *    the size is in hizbs (a page size already says it). It describes the whole assignment.
 * The reference's verification status stays in the data (`dataStatus`, `authoritative`); it is
 * not repeated under every item.
 */
export function workloadLines(type: WorkType, w: WorkloadSnapshot): { lines: WorkloadLine[]; hint: string | null } {
  const verses: WorkloadLine | null = showsVerseCount(w.verses) ? { unit: 'verses', text: countLabel(w.verses, 'verses'), precision: 'exact' } : null;
  const size = type === 'RECITATION' && verses ? null : sizeLine(w);
  const lines = [verses, size].filter((l): l is WorkloadLine => l !== null && l.precision !== 'unavailable');
  const hint = size?.unit === 'hizbEquivalent' && w.pages.kind === 'exact' ? countLabel(w.pages.value, 'pages') : null;
  return { lines, hint };
}

/**
 * One concise line under the Quranic summary: «39 آية · بين صفحتين و3 صفحات», «16 حزبًا تقريبًا»
 * (+ `hint` «159 صفحة», shown apart and more subtly). `exact` tells whether every part is exact.
 */
export function workloadSummary(type: WorkType, w: WorkloadSnapshot): { text: string; exact: boolean; hint: string | null } {
  const { lines, hint } = workloadLines(type, w);
  return { text: lines.map((l) => l.text).join(' · '), exact: lines.every((l) => l.precision === 'exact'), hint };
}
