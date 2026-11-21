/**
 * Quran workload engine for one versioned Mushaf edition (pure, deterministic, no I/O).
 * Positions are integers (verse index 1 … totalAyahs); nothing is rounded.
 */
import {
  STATUS_RANK,
  type DataStatus,
  type EngineError,
  type EngineOptions,
  type HizbEquivalent,
  type HizbsAndEighths,
  type HizbsAndPages,
  type Measure,
  type ReferenceDataset,
  type Result,
  type Unit,
  type VerseRange,
  type VerseRef,
  type Workload,
  type WorkloadOptions,
} from './types.ts';

const rank = (s: DataStatus) => STATUS_RANK.indexOf(s);
const weakest = (list: DataStatus[]): DataStatus => list.reduce((a, b) => (rank(b) < rank(a) ? b : a), 'print-verified');
const fail = <T>(error: EngineError): Result<T> => ({ ok: false, error });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/** Boundaries of one unit: start verse index of each unit (null = unknown) and their statuses. */
interface Boundaries {
  starts: (number | null)[];
  status: DataStatus[];
}

export interface QuranEngine {
  readonly editionId: string;
  readonly totalAyahs: number;
  readonly unitCounts: Readonly<Record<Unit, number>>;
  ayahCount(surah: number): number | null;
  isValid(ref: unknown): ref is VerseRef;
  /** −1, 0, 1 in Mushaf order (throws on an invalid reference) */
  compare(a: VerseRef, b: VerseRef): -1 | 0 | 1;
  toIndex(ref: VerseRef): Result<number>;
  fromIndex(index: number): Result<VerseRef>;
  /** Unit number containing a verse (page = printed page number) */
  locate(ref: VerseRef, unit: Unit): Result<{ number: number; dataStatus: DataStatus }>;
  /** The verse range of whole units n…m (e.g. pages 10–12, hizb 3) */
  unitRange(unit: Unit, first: number, last?: number): Result<VerseRange>;
  surahRange(first: number, last?: number): Result<VerseRange>;
  workload(range: VerseRange, options?: WorkloadOptions): Result<Workload>;
}

export function createEngine(ds: ReferenceDataset, options: EngineOptions = {}): QuranEngine {
  const minRank = rank(options.minStatusForRanking ?? 'print-verified');
  const counts = ds.surahs.map((s) => s.ayahCount);
  if (counts.length !== 114) throw new Error('dataset must list 114 surahs');
  // offsets[s] = number of verses before surah s+1 (null once a count is unknown)
  const offsets: (number | null)[] = [0];
  for (const c of counts) {
    const prev = offsets[offsets.length - 1] ?? null;
    offsets.push(prev === null || c === null ? null : prev + c);
  }
  const total = offsets[114];
  // Every verse position depends on the counts of the surahs before it: no partial index
  if (total === null || total === undefined) throw new Error('surah verse counts are incomplete: this dataset cannot be used');
  if (total !== ds.totalAyahs) throw new Error(`surah counts add up to ${total}, dataset says ${ds.totalAyahs}`);
  const firstPage = ds.pageStarts[0]?.page ?? 1;

  const idx = (surah: number, ayah: number): number | null => {
    const off = offsets[surah - 1];
    return off === null || off === undefined ? null : off + ayah;
  };
  const startOf = (s: number | null, a: number | null) => (s === null || a === null ? null : idx(s, a));

  const eighths: Boundaries = {
    starts: ds.eighthStarts.map((e) => startOf(e.surah, e.ayah)),
    status: ds.eighthStarts.map((e) => e.status),
  };
  const every = (b: Boundaries, step: number): Boundaries => ({
    starts: b.starts.filter((_, i) => i % step === 0),
    status: b.status.filter((_, i) => i % step === 0),
  });
  const units: Record<Unit, Boundaries> = {
    page: { starts: ds.pageStarts.map((p) => startOf(p.surah, p.ayah)), status: ds.pageStarts.map((p) => p.status) },
    eighth: eighths,
    quarter: every(eighths, 2),
    hizb: every(eighths, 8),
    juz: every(eighths, 16),
  };
  const unitCounts = Object.fromEntries(Object.entries(units).map(([k, v]) => [k, v.starts.length])) as Record<Unit, number>;
  const surahStatus = ds.surahs.map((s) => s.status);

  const valid = (ref: unknown): ref is VerseRef => {
    if (typeof ref !== 'object' || ref === null) return false;
    const { surah, ayah } = ref as VerseRef;
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1) return false;
    const c = counts[surah - 1];
    return c !== null && c !== undefined && ayah <= c;
  };
  const toIndex = (ref: VerseRef): Result<number> => {
    if (!valid(ref)) return fail({ code: 'INVALID_REFERENCE', message: `not a verse of this edition: ${JSON.stringify(ref)}`, ref });
    const i = idx(ref.surah, ref.ayah);
    return i === null ? fail({ code: 'DATA_UNAVAILABLE', message: 'a preceding surah count is unknown' }) : ok(i);
  };
  const fromIndex = (index: number): Result<VerseRef> => {
    if (!Number.isInteger(index) || total === null || index < 1 || index > total)
      return fail({ code: 'INVALID_REFERENCE', message: `verse index out of range: ${index}`, ref: index });
    let lo = 1, hi = 114; // last surah whose offset < index
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((offsets[mid - 1] as number) < index) lo = mid; else hi = mid - 1;
    }
    return ok({ surah: lo, ayah: index - (offsets[lo - 1] as number) });
  };

  /**
   * 0-based position of the unit containing verse index `i`, or null when unknown boundaries make
   * it ambiguous (the nearest known starts around `i` are not adjacent).
   */
  const unitAt = (b: Boundaries, i: number): number | null => {
    let found: number | null = null;
    for (let u = b.starts.length - 1; u >= 0; u--) {
      const s = b.starts[u] ?? null;
      if (s === null) continue;
      if (s <= i) { found = u; break; }
    }
    if (found === null) return null;
    for (let u = found + 1; u < b.starts.length; u++) {
      const s = b.starts[u] ?? null;
      if (s === null) return null; // an unknown boundary right after: cannot tell
      if (s > i) return found;
    }
    return found;
  };

  const measure = (unit: Unit, s: number, e: number, est: boolean): Measure => {
    const b = units[unit];
    const u1 = unitAt(b, s), u2 = unitAt(b, e);
    if (u1 === null || u2 === null) return { kind: 'unavailable', reason: `${unit} boundaries around this range are not in the reference data` };
    const nextStart = u2 + 1 < b.starts.length ? b.starts[u2 + 1] : (total as number) + 1;
    if (nextStart === null) return { kind: 'unavailable', reason: `the end of ${unit} ${u2 + 1} is not in the reference data` };
    const startAligned = b.starts[u1] === s;
    const endAligned = nextStart === e + 1;
    const touched = u2 - u1 + 1;
    const used = b.status.slice(u1, Math.min(u2 + 2, b.status.length));
    const dataStatus = weakest(used);
    if (startAligned && endAligned) return { kind: 'exact', value: touched, touched, dataStatus };
    const whole = touched - (startAligned ? 0 : 1) - (endAligned ? 0 : 1);
    const m: Measure = {
      kind: 'bounded',
      greaterThan: Math.max(0, whole),
      lessThan: touched,
      touched,
      partialAtStart: !startAligned,
      partialAtEnd: !endAligned,
      dataStatus,
    };
    if (est) {
      // Share of each partial unit by its NUMBER of verses — verses differ in length, so this is approximate
      const share = (u: number, from: number, to: number) => {
        const a = b.starts[u] as number;
        const z = (u + 1 < b.starts.length ? (b.starts[u + 1] as number) : (total as number) + 1) - 1;
        return (Math.min(to, z) - Math.max(from, a) + 1) / (z - a + 1);
      };
      let v: number;
      if (u1 === u2) v = share(u1, s, e);
      else v = share(u1, s, e) + share(u2, s, e) + (touched - 2);
      m.estimate = { method: 'verse-share', value: v, caveat: 'assumes equal verse length inside a partial unit; approximate, never exact' };
    }
    return m;
  };

  /**
   * Complete hizbs of [s, e] + the remainder in `unit` (pages or eighths): the hizbs lying ENTIRELY
   * inside, then the parts before and after them measured in that unit with the edition's actual
   * boundaries (each verse counted once: a unit shared with a hizb only counts its part outside the
   * hizb, hence bounded). Unavailable when no hizb lies entirely inside the range.
   */
  type HizbsPlus =
    | { kind: 'exact'; hizbs: number; rest: number; dataStatus: DataStatus }
    | { kind: 'bounded'; hizbs: number; rest: { greaterThan: number; lessThan: number }; dataStatus: DataStatus }
    | { kind: 'unavailable'; reason: string };
  const hizbsPlus = (unit: 'page' | 'eighth', s: number, e: number): HizbsPlus => {
    const b = units.hizb;
    const n = b.starts.length;
    let first = -1, last = -1;
    for (let u = 0; u < n; u++) {
      const start = b.starts[u] ?? null;
      const next = u + 1 < n ? (b.starts[u + 1] ?? null) : (total as number) + 1;
      if (start === null || next === null) {
        if ((start ?? 0) <= e && (next ?? Infinity) > s) return { kind: 'unavailable', reason: 'hizb boundaries around this range are not in the reference data' };
        continue;
      }
      if (start >= s && next - 1 <= e) {
        if (first < 0) first = u;
        last = u;
      }
    }
    if (first < 0) return { kind: 'unavailable', reason: 'no complete hizb lies inside this range' };
    const hizbStart = b.starts[first] as number;
    const hizbEnd = (last + 1 < n ? (b.starts[last + 1] as number) : (total as number) + 1) - 1;
    const parts: Measure[] = [];
    if (s < hizbStart) parts.push(measure(unit, s, hizbStart - 1, false));
    if (e > hizbEnd) parts.push(measure(unit, hizbEnd + 1, e, false));
    let lo = 0, hi = 0, exact = true;
    const statuses: DataStatus[] = b.status.slice(first, Math.min(last + 2, n));
    for (const p of parts) {
      if (p.kind === 'unavailable') return { kind: 'unavailable', reason: p.reason };
      statuses.push(p.dataStatus);
      if (p.kind === 'exact') {
        lo += p.value;
        hi += p.value;
      } else {
        exact = false;
        lo += p.greaterThan;
        hi += p.lessThan;
      }
    }
    const hizbs = last - first + 1;
    const dataStatus = weakest(statuses);
    return exact ? { kind: 'exact', hizbs, rest: lo, dataStatus } : { kind: 'bounded', hizbs, rest: { greaterThan: lo, lessThan: hi }, dataStatus };
  };

  /** Complete hizbs + remaining pages (see HizbsAndPages). */
  const hizbsAndPagesOf = (s: number, e: number): HizbsAndPages => {
    const x = hizbsPlus('page', s, e);
    if (x.kind === 'unavailable') return x;
    return x.kind === 'exact'
      ? { kind: 'exact', hizbs: x.hizbs, pages: x.rest, dataStatus: x.dataStatus }
      : { kind: 'bounded', hizbs: x.hizbs, pages: x.rest, dataStatus: x.dataStatus };
  };

  /**
   * Complete hizbs + remaining eighths (see HizbsAndEighths). Every hizb edge is an eighth edge, so
   * a remainder can only be partial at the two outer ends of the range (at most one eighth each).
   */
  const hizbsAndEighthsOf = (s: number, e: number): HizbsAndEighths => {
    const x = hizbsPlus('eighth', s, e);
    if (x.kind === 'unavailable') return x;
    return x.kind === 'exact'
      ? { kind: 'exact', hizbs: x.hizbs, eighths: x.rest, dataStatus: x.dataStatus }
      : { kind: 'bounded', hizbs: x.hizbs, eighths: x.rest, dataStatus: x.dataStatus };
  };

  const engine: QuranEngine = {
    editionId: ds.editionId,
    totalAyahs: total as number,
    unitCounts,
    ayahCount: (surah) => (Number.isInteger(surah) && surah >= 1 && surah <= 114 ? (counts[surah - 1] ?? null) : null),
    isValid: valid,
    compare(a, b) {
      const x = toIndex(a), y = toIndex(b);
      if (!x.ok || !y.ok) throw new Error('compare: invalid reference');
      return x.value < y.value ? -1 : x.value > y.value ? 1 : 0;
    },
    toIndex,
    fromIndex,
    locate(ref, unit) {
      const i = toIndex(ref);
      if (!i.ok) return i;
      const b = units[unit];
      const u = unitAt(b, i.value);
      if (u === null) return fail({ code: 'DATA_UNAVAILABLE', message: `${unit} boundaries around this verse are unknown` });
      const number = unit === 'page' ? firstPage + u : u + 1;
      return ok({ number, dataStatus: weakest([b.status[u] as DataStatus, ...(u + 1 < b.status.length ? [b.status[u + 1] as DataStatus] : [])]) });
    },
    unitRange(unit, first, last = first) {
      const b = units[unit];
      const base = unit === 'page' ? firstPage : 1;
      const f = first - base, l = last - base;
      if (!Number.isInteger(first) || !Number.isInteger(last) || f < 0 || l >= b.starts.length || l < f)
        return fail({ code: 'INVALID_UNIT_NUMBER', message: `no ${unit} ${first}${last !== first ? `–${last}` : ''} in this edition` });
      const s = b.starts[f] ?? null;
      const next = l + 1 < b.starts.length ? (b.starts[l + 1] ?? null) : (total as number) + 1;
      if (s === null || next === null) return fail({ code: 'DATA_UNAVAILABLE', message: `${unit} boundaries unknown` });
      const from = fromIndex(s), to = fromIndex(next - 1);
      return from.ok && to.ok ? ok({ from: from.value, to: to.value }) : fail({ code: 'DATA_UNAVAILABLE', message: 'conversion failed' });
    },
    surahRange(first, last = first) {
      if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last > 114 || last < first)
        return fail({ code: 'INVALID_UNIT_NUMBER', message: `no surah ${first}${last !== first ? `–${last}` : ''}` });
      const c = counts[last - 1];
      if (c === null || c === undefined) return fail({ code: 'DATA_UNAVAILABLE', message: `verse count of surah ${last} unknown` });
      return ok({ from: { surah: first, ayah: 1 }, to: { surah: last, ayah: c } });
    },
    workload(range, opts = {}) {
      const a = toIndex(range.from), z = toIndex(range.to);
      if (!a.ok) return a;
      if (!z.ok) return z;
      let s = a.value, e = z.value, from = range.from, to = range.to;
      if (s > e) {
        if (!opts.allowReversed) return fail({ code: 'REVERSED_RANGE', message: 'the range ends before it starts (pass allowReversed to accept it)' });
        [s, e] = [e, s];
        [from, to] = [to, from];
      }
      const est = opts.includeEstimates === true;
      const m = {
        pages: measure('page', s, e, est),
        juz: measure('juz', s, e, est),
        hizbs: measure('hizb', s, e, est),
        quarters: measure('quarter', s, e, est),
        eighths: measure('eighth', s, e, est),
      };
      const touchedSurahs = to.surah - from.surah + 1;
      const wholeSurahs =
        touchedSurahs - (from.ayah === 1 ? 0 : 1) - (to.ayah === counts[to.surah - 1] ? 0 : 1);
      const statuses: DataStatus[] = surahStatus.slice(from.surah - 1, to.surah);
      for (const x of Object.values(m)) if (x.kind !== 'unavailable') statuses.push(x.dataStatus);
      const dataStatus = weakest(statuses);
      return ok({
        editionId: ds.editionId,
        from,
        to,
        startIndex: s,
        endIndex: e,
        verses: e - s + 1,
        surahs: { whole: touchedSurahs === 1 ? (wholeSurahs === 1 ? 1 : 0) : Math.max(0, wholeSurahs), touched: touchedSurahs },
        ...m,
        hizbsAndPages: hizbsAndPagesOf(s, e),
        hizbsAndEighths: hizbsAndEighthsOf(s, e),
        hizbEquivalent: hizbEquivalent(m.hizbs, m.eighths),
        dataStatus,
        authoritative: rank(dataStatus) >= minRank && Object.values(m).every((x) => x.kind !== 'unavailable'),
      });
    },
  };
  return engine;
}

/** Eighths per hizb in every edition (a hizb = 4 quarters = 8 eighths). */
const EIGHTHS_PER_HIZB = 8;
/** From this many hizbs the size is rounded to whole hizbs, below it to half hizbs. */
export const WHOLE_HIZB_ROUNDING_FROM = 10;

/**
 * Approximate size in hizbs (HizbEquivalent) from the STRICT measures of a range — pure, so the
 * server can also derive it from a stored snapshot without recomputing (or rewriting) it.
 *
 * Rounding (in eighths, x = the true eighth-equivalent amount):
 *  - exact hizbs measure → exact (whole hizbs, strict boundaries); no rounding at all;
 *  - step = 4 eighths (½ hizb), or 8 (1 hizb) once the lower bound reaches 10 hizbs;
 *  - x rounds to the nearest multiple of the step, halves up (thresholds at step × (k + ½));
 *  - exact eighth count → that rounding; bounded (lower < x < upper) → approximate only when no
 *    threshold lies STRICTLY between the bounds (every possible x rounds the same), otherwise
 *    `between` the two neighbouring values. The bounds are at most 2 eighths apart, the step at
 *    least 4, so at most one threshold can lie between them.
 */
export function hizbEquivalent(hizbs: Measure, eighths: Measure): HizbEquivalent {
  if (hizbs.kind === 'exact') return { kind: 'exact', hizbs: hizbs.value };
  if (eighths.kind === 'unavailable') return { kind: 'unavailable', reason: eighths.reason };
  const lower = eighths.kind === 'exact' ? eighths.value : eighths.greaterThan;
  const upper = eighths.kind === 'exact' ? eighths.value : eighths.lessThan;
  const stepEighths = lower >= WHOLE_HIZB_ROUNDING_FROM * EIGHTHS_PER_HIZB ? EIGHTHS_PER_HIZB : EIGHTHS_PER_HIZB / 2;
  const step = stepEighths === EIGHTHS_PER_HIZB ? 1 : 0.5;
  const nearest = (x: number) => Math.floor(x / stepEighths + 0.5) * stepEighths; // halves up
  const toHizbs = (x: number) => x / EIGHTHS_PER_HIZB;
  if (eighths.kind === 'exact')
    return { kind: 'approximate', hizbs: toHizbs(nearest(lower)), step, eighths: { exact: lower } };
  // the first threshold strictly above the lower bound
  const threshold = (Math.floor(lower / stepEighths - 0.5) + 1.5) * stepEighths;
  const bounds = { greaterThan: lower, lessThan: upper };
  if (threshold < upper)
    return { kind: 'between', from: toHizbs(threshold - stepEighths / 2), to: toHizbs(threshold + stepEighths / 2), step, eighths: bounds };
  return { kind: 'approximate', hizbs: toHizbs(nearest((lower + upper) / 2)), step, eighths: bounds };
}

/**
 * Compare two workloads in one unit. Exact values compare exactly; bounded values compare only
 * when their intervals cannot overlap; otherwise the answer is 'indeterminate'. `authoritative`
 * tells whether the result may be used to RANK students (both workloads authoritative).
 */
export function compareWorkloads(
  a: Workload,
  b: Workload,
  unit: 'verses' | 'pages' | 'juz' | 'hizbs' | 'quarters' | 'eighths',
): { result: -1 | 0 | 1 | 'indeterminate' | 'unavailable'; basis: 'exact' | 'bounds' | 'none'; authoritative: boolean } {
  if (a.editionId !== b.editionId) return { result: 'unavailable', basis: 'none', authoritative: false };
  const authoritative = a.authoritative && b.authoritative;
  if (unit === 'verses') return { result: Math.sign(a.verses - b.verses) as -1 | 0 | 1, basis: 'exact', authoritative };
  const x = a[unit], y = b[unit];
  if (x.kind === 'unavailable' || y.kind === 'unavailable') return { result: 'unavailable', basis: 'none', authoritative: false };
  // Open interval (lo, hi) for bounded, the point v for exact
  const lo = (m: Exclude<Measure, { kind: 'unavailable' }>) => (m.kind === 'exact' ? m.value : m.greaterThan);
  const hi = (m: Exclude<Measure, { kind: 'unavailable' }>) => (m.kind === 'exact' ? m.value : m.lessThan);
  if (x.kind === 'exact' && y.kind === 'exact') return { result: Math.sign(x.value - y.value) as -1 | 0 | 1, basis: 'exact', authoritative };
  if (hi(x) <= lo(y)) return { result: -1, basis: 'bounds', authoritative };
  if (hi(y) <= lo(x)) return { result: 1, basis: 'bounds', authoritative };
  return { result: 'indeterminate', basis: 'none', authoritative: false };
}
