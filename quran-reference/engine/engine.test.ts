// node --test engine/engine.test.ts   (Node ≥ 23.6 runs TypeScript directly)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createEngine, compareWorkloads, hizbEquivalent } from './engine.ts';
import { STATUS_RANK, type ReferenceDataset, type VerseRange, type Workload, type Measure } from './types.ts';

const raw = readFileSync(new URL('../data/qalun-tn-v1.json', import.meta.url), 'utf8');
const dataset = (): ReferenceDataset => JSON.parse(raw);
const q = createEngine(dataset());
// For tests of the engine's arithmetic: rank results from every status
const lenient = createEngine(dataset(), { minStatusForRanking: 'needs-review' });

const v = (surah: number, ayah: number) => ({ surah, ayah });
const r = (fs: number, fa: number, ts: number, ta: number): VerseRange => ({ from: v(fs, fa), to: v(ts, ta) });
function w(range: VerseRange, engine = q, opts = {}): Workload {
  const res = engine.workload(range, opts);
  if (!res.ok) throw new Error(JSON.stringify(res.error));
  return res.value;
}
const exact = (m: Measure) => (m.kind === 'exact' ? m.value : assert.fail(`expected exact, got ${JSON.stringify(m)}`));
const ok = <T>(res: { ok: true; value: T } | { ok: false; error: unknown }): T => (res.ok ? res.value : assert.fail(JSON.stringify(res.error)));
const csv = (name: string) => {
  const [head, ...lines] = readFileSync(new URL(`../data/readings/${name}`, import.meta.url), 'utf8').trim().split('\n');
  const keys = head!.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').slice(0, keys.length).map((x, i) => [keys[i], x])));
};

describe('references', () => {
  test('edition shape: 6236 verses, 603 pages, 30 juz, 60 hizbs, 240 quarters, 480 eighths', () => {
    assert.equal(q.totalAyahs, 6236);
    assert.deepEqual(q.unitCounts, { page: 603, eighth: 480, quarter: 240, hizb: 60, juz: 30 });
  });

  test('validation: real verses only', () => {
    assert.ok(q.isValid(v(1, 7)) && q.isValid(v(2, 286)) && q.isValid(v(114, 6)));
    for (const bad of [v(1, 8), v(2, 287), v(0, 1), v(115, 1), v(1, 0), v(1.5, 1), v(2, 2.5), null, {}, 'x', { surah: '1', ayah: 1 }])
      assert.equal(q.isValid(bad), false, JSON.stringify(bad));
  });

  test('index ↔ reference round-trip for EVERY verse, strictly in Mushaf order', () => {
    let expected = 0;
    for (let s = 1; s <= 114; s++)
      for (let a = 1; a <= q.ayahCount(s)!; a++) {
        const i = ok(q.toIndex(v(s, a)));
        assert.equal(i, ++expected);
        assert.deepEqual(ok(q.fromIndex(i)), v(s, a));
      }
    assert.equal(expected, 6236);
    assert.equal(q.fromIndex(0).ok, false);
    assert.equal(q.fromIndex(6237).ok, false);
  });

  test('compare follows Mushaf order across surahs', () => {
    assert.equal(q.compare(v(2, 286), v(3, 1)), -1);
    assert.equal(q.compare(v(3, 1), v(2, 286)), 1);
    assert.equal(q.compare(v(55, 13), v(55, 13)), 0);
    assert.throws(() => q.compare(v(2, 300), v(3, 1)));
  });
});

describe('first and last verses, transitions', () => {
  test('1:1 opens page 2, juz/hizb/quarter/eighth 1; 114:6 closes page 604 and eighth 480', () => {
    assert.equal(ok(q.locate(v(1, 1), 'page')).number, 2);
    for (const u of ['juz', 'hizb', 'quarter', 'eighth'] as const) assert.equal(ok(q.locate(v(1, 1), u)).number, 1);
    assert.equal(ok(q.locate(v(114, 6), 'page')).number, 604);
    assert.equal(ok(q.locate(v(114, 6), 'eighth')).number, 480);
    assert.equal(ok(q.locate(v(114, 6), 'hizb')).number, 60);
    assert.equal(ok(q.locate(v(114, 6), 'juz')).number, 30);
  });

  test('surah transitions: al-Fatiha and al-Baqara share page 2; 87:14 | 87:15 is a page break', () => {
    assert.equal(ok(q.locate(v(2, 1), 'page')).number, 2);
    assert.equal(ok(q.locate(v(87, 14), 'page')).number, 591);
    assert.equal(ok(q.locate(v(87, 15), 'page')).number, 592);
  });

  test('page transitions: every page is exactly one page, contiguous, verses add up to 6236', () => {
    let prevEnd = 0, verses = 0;
    for (let p = 2; p <= 604; p++) {
      const range = ok(q.unitRange('page', p));
      const x = w(range);
      assert.equal(exact(x.pages), 1, `page ${p}`);
      assert.equal(x.startIndex, prevEnd + 1, `page ${p} starts right after page ${p - 1}`);
      assert.equal(ok(q.locate(range.from, 'page')).number, p);
      assert.equal(ok(q.locate(range.to, 'page')).number, p);
      prevEnd = x.endIndex;
      verses += x.verses;
    }
    assert.equal(verses, 6236);
  });
});

describe('divisions', () => {
  for (const [unit, n, key] of [['eighth', 480, 'eighths'], ['quarter', 240, 'quarters'], ['hizb', 60, 'hizbs'], ['juz', 30, 'juz']] as const)
    test(`every ${unit} is exactly one ${unit}, contiguous`, () => {
      let prevEnd = 0;
      for (let i = 1; i <= n; i++) {
        const x = w(ok(q.unitRange(unit, i)));
        assert.equal(exact(x[key]), 1, `${unit} ${i}`);
        assert.equal(x.startIndex, prevEnd + 1);
        prevEnd = x.endIndex;
      }
      assert.equal(prevEnd, 6236);
    });

  test('nesting: a juz = 2 hizbs = 8 quarters = 16 eighths; a hizb = 4 quarters = 8 eighths', () => {
    for (let j = 1; j <= 30; j++) {
      const x = w(ok(q.unitRange('juz', j)));
      assert.deepEqual([exact(x.hizbs), exact(x.quarters), exact(x.eighths)], [2, 8, 16]);
    }
    for (let h = 1; h <= 60; h++) {
      const x = w(ok(q.unitRange('hizb', h)));
      assert.deepEqual([exact(x.quarters), exact(x.eighths)], [4, 8]);
    }
  });

  test('boundary verses: the first verse of each eighth is in it, the verse before is in the previous one', () => {
    for (let i = 2; i <= 480; i++) {
      const start = ok(q.unitRange('eighth', i)).from;
      assert.equal(ok(q.locate(start, 'eighth')).number, i);
      const before = ok(q.fromIndex(ok(q.toIndex(start)) - 1));
      assert.equal(ok(q.locate(before, 'eighth')).number, i - 1);
    }
  });

  test('unit numbers outside the edition are refused', () => {
    for (const [u, n] of [['page', 1], ['page', 605], ['hizb', 0], ['hizb', 61], ['quarter', 241], ['eighth', 481], ['juz', 31]] as const)
      assert.equal(q.unitRange(u, n).ok, false, `${u} ${n}`);
    assert.equal(q.unitRange('page', 12, 10).ok, false);
  });
});

describe('all 114 surahs', () => {
  test('a whole surah: its verse count, one whole surah, pages exact only when it fills whole pages', () => {
    let total = 0;
    for (let s = 1; s <= 114; s++) {
      const x = w(ok(q.surahRange(s)));
      assert.equal(x.verses, q.ayahCount(s));
      assert.deepEqual(x.surahs, { whole: 1, touched: 1 });
      const firstPage = ok(q.unitRange('page', ok(q.locate(v(s, 1), 'page')).number));
      const lastPage = ok(q.unitRange('page', ok(q.locate(v(s, q.ayahCount(s)!), 'page')).number));
      const aligned = firstPage.from.surah === s && firstPage.from.ayah === 1 &&
        lastPage.to.surah === s && lastPage.to.ayah === q.ayahCount(s);
      assert.equal(x.pages.kind === 'exact', aligned, `surah ${s}`);
      total += x.verses;
    }
    assert.equal(total, 6236);
  });

  test('al-Baqara: pages 2–49 touched (48), page 2 shared with al-Fatiha → 47 < pages < 48', () => {
    const x = w(ok(q.surahRange(2)));
    assert.equal(x.pages.kind, 'bounded');
    if (x.pages.kind === 'bounded') assert.deepEqual([x.pages.greaterThan, x.pages.lessThan, x.pages.touched, x.pages.partialAtStart, x.pages.partialAtEnd], [47, 48, 48, true, false]);
  });
});

describe('ranges', () => {
  test('crossing several surahs: whole and touched surahs', () => {
    assert.deepEqual(w(r(2, 250, 3, 20)).surahs, { whole: 0, touched: 2 });
    assert.deepEqual(w(r(1, 1, 3, 200)).surahs, { whole: 3, touched: 3 });
    assert.deepEqual(w(r(78, 1, 114, 6)).surahs, { whole: 37, touched: 37 });
    assert.equal(w(r(78, 1, 114, 6)).verses, 6236 - ok(q.toIndex(v(78, 1))) + 1);
  });

  test('whole-page assignment: pages 10–12 = exactly 3 pages', () => {
    assert.equal(exact(w(ok(q.unitRange('page', 10, 12))).pages), 3);
  });

  test('juz 30 (an-Naba to an-Nas) = exactly 1 juz, 2 hizbs', () => {
    const x = w(r(78, 1, 114, 6));
    assert.deepEqual([exact(x.juz), exact(x.hizbs)], [1, 2]);
  });

  test('partial pages are bounded, never exact: 2:6–2:20 lies inside pages 3–4', () => {
    const x = w(r(2, 6, 2, 20));
    assert.equal(x.pages.kind, 'bounded');
    if (x.pages.kind === 'bounded') {
      assert.equal(x.pages.touched, 2);
      assert.ok(x.pages.greaterThan <= x.pages.lessThan);
      assert.equal(x.pages.estimate, undefined); // estimates only on request
    }
  });

  test('a range inside one page: 0 < pages < 1', () => {
    const x = w(r(2, 7, 2, 8));
    assert.equal(x.pages.kind, 'bounded');
    if (x.pages.kind === 'bounded') assert.deepEqual([x.pages.greaterThan, x.pages.lessThan], [0, 1]);
  });

  test('estimates: only on request, labelled, strictly inside the bounds', () => {
    const x = w(r(2, 6, 2, 30), q, { includeEstimates: true });
    assert.equal(x.pages.kind, 'bounded');
    if (x.pages.kind === 'bounded') {
      assert.equal(x.pages.estimate?.method, 'verse-share');
      assert.match(x.pages.estimate!.caveat, /approximate/);
      assert.ok(x.pages.estimate!.value > x.pages.greaterThan && x.pages.estimate!.value < x.pages.lessThan);
    }
  });

  test('invalid and reversed ranges', () => {
    const bad = q.workload(r(2, 1, 2, 300));
    assert.equal(!bad.ok && bad.error.code, 'INVALID_REFERENCE');
    const rev = q.workload(r(3, 1, 2, 1));
    assert.equal(!rev.ok && rev.error.code, 'REVERSED_RANGE');
    const swapped = w(r(3, 1, 2, 1), q, { allowReversed: true });
    assert.deepEqual([swapped.from, swapped.to], [v(2, 1), v(3, 1)]);
    assert.equal(swapped.verses, w(r(2, 1, 3, 1)).verses);
  });
});

describe('consistency', () => {
  test('additivity: verses and exact pages split at any page boundary', () => {
    for (const p of [5, 77, 300, 590]) {
      const a = w(ok(q.unitRange('page', 2, p))), b = w(ok(q.unitRange('page', p + 1, 604)));
      assert.equal(a.verses + b.verses, 6236);
      assert.equal(exact(a.pages) + exact(b.pages), 603);
    }
  });

  test('monotonic: extending a range never lowers any bound', () => {
    let prev = w(r(2, 1, 2, 1));
    for (const end of [5, 20, 60, 141, 142, 200, 286]) {
      const cur = w(r(2, 1, 2, end));
      const lo = (m: Measure) => (m.kind === 'exact' ? m.value : m.kind === 'bounded' ? m.greaterThan : NaN);
      const hi = (m: Measure) => (m.kind === 'exact' ? m.value : m.kind === 'bounded' ? m.lessThan : NaN);
      for (const k of ['pages', 'hizbs', 'quarters', 'eighths'] as const) {
        assert.ok(lo(cur[k]) >= lo(prev[k]) && hi(cur[k]) >= hi(prev[k]), `${k} up to 2:${end}`);
      }
      prev = cur;
    }
  });

  test('deterministic: same input → identical output', () => {
    assert.deepEqual(w(r(18, 1, 20, 50), q, { includeEstimates: true }), w(r(18, 1, 20, 50), q, { includeEstimates: true }));
  });
});

describe('comparisons and ranking policy', () => {
  test('exact vs exact; disjoint bounds decide; overlapping bounds are indeterminate', () => {
    const three = w(ok(q.unitRange('page', 10, 12))), one = w(ok(q.unitRange('page', 10)));
    assert.equal(compareWorkloads(three, one, 'pages').result, 1);
    assert.equal(compareWorkloads(three, one, 'pages').basis, 'exact');
    const tiny = w(r(2, 7, 2, 8)); // 0 < pages < 1
    assert.deepEqual([compareWorkloads(tiny, one, 'pages').result, compareWorkloads(tiny, one, 'pages').basis], [-1, 'bounds']);
    const other = w(r(2, 9, 2, 10)); // also 0 < pages < 1
    assert.equal(compareWorkloads(tiny, other, 'pages').result, 'indeterminate');
    assert.equal(compareWorkloads(tiny, other, 'verses').result, 0);
  });

  test('nothing is authoritative for ranking until it is print-verified (default policy)', () => {
    const x = w(ok(q.unitRange('page', 10)));
    assert.equal(x.authoritative, false);
    assert.equal(compareWorkloads(x, x, 'pages').authoritative, false);
    assert.equal(w(ok(lenient.unitRange('page', 10)), lenient).authoritative, true);
  });

  test('different editions are never compared', () => {
    const ds2 = dataset(); ds2.editionId = 'another-edition';
    const other = createEngine(ds2);
    const a = w(r(1, 1, 1, 7)), b = w(r(1, 1, 1, 7), other);
    assert.equal(compareWorkloads(a, b, 'verses').result, 'unavailable');
  });
});

describe('missing or uncertain reference data', () => {
  test('an unknown page start makes nearby page measures unavailable, not guessed', () => {
    const ds = dataset();
    ds.pageStarts[98]!.surah = null; ds.pageStarts[98]!.ayah = null; // printed page 100 unknown
    const e = createEngine(ds);
    const near = e.workload(r(4, 135, 4, 140)); // on pages 99–100
    assert.ok(near.ok);
    if (near.ok) {
      assert.equal(near.value.pages.kind, 'unavailable');
      assert.equal(near.value.authoritative, false);
      assert.equal(near.value.hizbs.kind === 'unavailable', false); // other units still answer
    }
    const far = e.workload(ok(e.unitRange('page', 300, 310)));
    assert.ok(far.ok && far.value.pages.kind === 'exact');
    assert.equal(e.locate(v(4, 136), 'page').ok, false);
  });

  test('an unknown surah count: the dataset is refused (every later position depends on it)', () => {
    const ds = dataset();
    ds.surahs[49]!.ayahCount = null; // surah 50
    ds.totalAyahs = null as unknown as number;
    assert.throws(() => createEngine(ds)); // total cannot be checked: refuse the dataset
  });

  test('a needs-review boundary is reported in dataStatus and blocks ranking even when lenient', () => {
    const ds = dataset();
    ds.pageStarts[8]!.status = 'needs-review'; // printed page 10
    const e = createEngine(ds, { minStatusForRanking: 'structurally-consistent' });
    const x = w(ok(e.unitRange('page', 10)), e);
    assert.equal(x.dataStatus, 'needs-review');
    assert.equal(x.authoritative, false);
    assert.equal(w(ok(e.unitRange('page', 300)), e).authoritative, true);
  });
});

describe('the engine against boundaries read independently from the PDF', () => {
  test('71 page starts re-read from page tops: each starts its page', () => {
    for (const t of csv('independent_tops.csv')) {
      const p = Number(t.printed);
      const start = ok(q.unitRange('page', p)).from;
      assert.equal(start.ayah, Number(t.start_ayah), `page ${p}`);
    }
  });

  test('28 quarters re-read blind: each verse opens its quarter', () => {
    for (const x of csv('independent_quarters.csv')) {
      const ref = v(Number(x.surah), Number(x.ayah));
      assert.equal(ok(q.locate(ref, 'quarter')).number, Number(x.quarter));
      assert.deepEqual(ok(q.unitRange('quarter', Number(x.quarter))).from, ref);
    }
  });

  test('a single wrong boundary in the data is caught', () => {
    const ds = dataset();
    ds.eighthStarts[48]!.ayah = 93; // quarter 25: the print has 3:92 (Hafs would be 3:93)
    const e = createEngine(ds);
    assert.notDeepEqual(ok(e.unitRange('quarter', 25)).from, v(3, 92));
  });
});

describe('complete hizbs + remaining pages (actual boundaries, no 10-pages-per-hizb assumption)', () => {
  const hp = (range: VerseRange) => w(range).hizbsAndPages;

  test('every run of whole hizbs is exactly k hizbs and 0 pages', () => {
    for (let h = 1; h <= 60; h++)
      for (const k of [1, 2, 5]) {
        if (h + k - 1 > 60) continue;
        assert.deepEqual(
          (({ kind, hizbs, pages }) => ({ kind, hizbs, pages }))(hp(ok(q.unitRange('hizb', h, h + k - 1))) as { kind: string; hizbs: number; pages: unknown }),
          { kind: 'exact', hizbs: k, pages: 0 },
          `hizbs ${h}–${h + k - 1}`,
        );
      }
    const juz30 = hp(r(78, 1, 114, 6));
    assert.equal(juz30.kind === 'exact' && juz30.hizbs, 2);
  });

  test('mixed, exact: a whole hizb followed by whole pages (hizbs 3 and 4 both start at a page top)', () => {
    const hizb3 = ok(q.unitRange('hizb', 3));
    const hizb4Page = ok(q.locate(ok(q.unitRange('hizb', 4)).from, 'page')).number;
    const twoPages = ok(q.unitRange('page', hizb4Page, hizb4Page + 1));
    assert.deepEqual(ok(q.unitRange('hizb', 4)).from, ok(q.unitRange('page', hizb4Page)).from); // page-aligned
    const x = hp({ from: hizb3.from, to: twoPages.to });
    assert.equal(x.kind, 'exact');
    if (x.kind === 'exact') assert.deepEqual([x.hizbs, x.pages], [1, 2]);
  });

  test('partial hizbs at both ends: the hizb count stays exact, the remainder is bounded (never fractional)', () => {
    const x = hp(r(9, 1, 9, 129)); // At-Tawbah: its hizb boundaries fall mid-page
    assert.equal(x.kind, 'bounded');
    if (x.kind === 'bounded') {
      assert.equal(x.hizbs, 1);
      assert.ok(Number.isInteger(x.pages.greaterThan) && Number.isInteger(x.pages.lessThan));
      assert.ok(x.pages.lessThan - x.pages.greaterThan <= 2); // at most one partial page on each side
    }
  });

  test('no double counting: hizb pages + remainder bounds always enclose the exact page count of whole-page ranges', () => {
    for (const [a, b] of [[2, 49], [50, 76], [100, 151], [282, 301], [560, 604], [3, 604]] as const) {
      const range = ok(q.unitRange('page', a, b));
      const x = hp(range);
      if (x.kind === 'unavailable') continue;
      // pages of the complete hizbs, measured by the same engine
      const first = ok(q.locate(range.from, 'hizb')).number;
      const hizbStart = ok(q.unitRange('hizb', first)).from.surah === range.from.surah && ok(q.unitRange('hizb', first)).from.ayah === range.from.ayah ? first : first + 1;
      const hizbPages = w(ok(q.unitRange('hizb', hizbStart, hizbStart + x.hizbs - 1))).pages;
      const lo = hizbPages.kind === 'exact' ? hizbPages.value : hizbPages.kind === 'bounded' ? hizbPages.greaterThan : NaN;
      const hi = hizbPages.kind === 'exact' ? hizbPages.value : hizbPages.kind === 'bounded' ? hizbPages.lessThan : NaN;
      const rest = x.kind === 'exact' ? [x.pages, x.pages] : [x.pages.greaterThan, x.pages.lessThan];
      const total = b - a + 1;
      assert.ok(lo + rest[0]! <= total && total <= hi + rest[1]!, `pages ${a}–${b}`);
    }
  });

  test('without a complete hizb: unavailable (the page measure is used instead)', () => {
    const x = w(r(19, 12, 19, 50));
    assert.equal(x.hizbsAndPages.kind, 'unavailable');
    assert.equal(x.pages.kind, 'bounded');
  });

  test('carries the data status of the boundaries it used', () => {
    const x = hp(r(78, 1, 114, 6));
    assert.ok(x.kind !== 'unavailable' && typeof x.dataStatus === 'string');
  });
});


describe('complete hizbs + remaining eighths (actual eighth boundaries; strict hizb 1 from al-Fatiha)', () => {
  const he = (range: VerseRange, engine = q) => w(range, engine).hizbsAndEighths;
  const shape = (x: Workload['hizbsAndEighths']) =>
    x.kind === 'exact' ? { kind: x.kind, hizbs: x.hizbs, eighths: x.eighths } : x.kind === 'bounded' ? { kind: x.kind, hizbs: x.hizbs, eighths: x.eighths } : { kind: x.kind };

  test('every single hizb and every run of hizbs: exactly k hizbs and 0 eighths', () => {
    for (let h = 1; h <= 60; h++)
      for (const k of [1, 2, 7]) {
        if (h + k - 1 > 60) continue;
        assert.deepEqual(shape(he(ok(q.unitRange('hizb', h, h + k - 1)))), { kind: 'exact', hizbs: k, eighths: 0 }, `hizbs ${h}–${h + k - 1}`);
      }
  });

  test('the whole Quran: 60 hizbs, nothing left', () => {
    assert.deepEqual(shape(he(r(1, 1, 114, 6))), { kind: 'exact', hizbs: 60, eighths: 0 });
  });

  test('real Qalun examples (exact and bounded remainders)', () => {
    const cases: [VerseRange, ReturnType<typeof shape>][] = [
      [r(78, 1, 114, 6), { kind: 'exact', hizbs: 2, eighths: 0 }], // juz 30
      [r(1, 1, 7, 206), { kind: 'exact', hizbs: 17, eighths: 4 }], // one exact remainder after the hizbs
      [r(9, 1, 9, 129), { kind: 'exact', hizbs: 1, eighths: 9 }], // at-Tawba: two exact remainders (pages are bounded there)
      [r(9, 1, 24, 64), { kind: 'exact', hizbs: 16, eighths: 10 }],
      [r(48, 1, 114, 6), { kind: 'bounded', hizbs: 9, eighths: { greaterThan: 1, lessThan: 2 } }], // one partial remainder (before)
      [r(2, 1, 11, 123), { kind: 'bounded', hizbs: 22, eighths: { greaterThan: 10, lessThan: 12 } }], // two partial remainders
    ];
    for (const [range, expected] of cases) assert.deepEqual(shape(he(range)), expected, JSON.stringify(range));
  });

  test('strict hizb 1: it starts at al-Fatiha, so a range starting at al-Baqara never contains it', () => {
    assert.deepEqual(ok(q.unitRange('hizb', 1)).from, v(1, 1));
    assert.deepEqual(shape(he(r(1, 1, 2, 286))), { kind: 'exact', hizbs: 4, eighths: 7 });
    const baqara = he(r(2, 1, 2, 286));
    assert.deepEqual(shape(baqara), { kind: 'bounded', hizbs: 3, eighths: { greaterThan: 14, lessThan: 15 } });
    // al-Baqara's first eighths stay a remainder: never turned into hizb 1
    assert.equal(he(r(2, 1, 3, 200)).kind !== 'unavailable' && (he(r(2, 1, 3, 200)) as { hizbs: number }).hizbs, 6);
  });

  test('remainders are never converted into hizbs, even when they add up to 8 eighths or more', () => {
    const x = he(r(9, 1, 9, 129));
    assert.ok(x.kind === 'exact' && x.eighths >= 8 && x.hizbs === 1);
  });

  test('no complete hizb (short ranges, a range inside one eighth, one verse): unavailable', () => {
    for (const range of [r(19, 12, 19, 50), r(36, 1, 36, 83), r(2, 6, 2, 20), r(1, 1, 1, 1), r(114, 6, 114, 6)])
      assert.equal(he(range).kind, 'unavailable', JSON.stringify(range));
    // a whole eighth exactly but no hizb: still unavailable (the eighth measure itself is exact)
    const eighth5 = ok(q.unitRange('eighth', 5));
    assert.equal(he(eighth5).kind, 'unavailable');
    assert.deepEqual(w(eighth5).eighths.kind, 'exact');
  });

  test('inclusive ranges: one verse more or less around a hizb changes the result as expected', () => {
    const h3 = ok(q.unitRange('hizb', 3));
    const before = ok(q.fromIndex(ok(q.toIndex(h3.from)) - 1));
    const after = ok(q.fromIndex(ok(q.toIndex(h3.to)) + 1));
    const lastButOne = ok(q.fromIndex(ok(q.toIndex(h3.to)) - 1));
    assert.deepEqual(shape(he({ from: before, to: h3.to })), { kind: 'bounded', hizbs: 1, eighths: { greaterThan: 0, lessThan: 1 } });
    assert.deepEqual(shape(he({ from: h3.from, to: after })), { kind: 'bounded', hizbs: 1, eighths: { greaterThan: 0, lessThan: 1 } });
    assert.equal(he({ from: h3.from, to: lastButOne }).kind, 'unavailable');
    // the remainder is exactly the next eighth when the range ends at its last verse
    const plusOneEighth = ok(q.unitRange('eighth', 25)); // eighth 25 = first eighth of hizb 4
    assert.deepEqual(shape(he({ from: h3.from, to: plusOneEighth.to })), { kind: 'exact', hizbs: 1, eighths: 1 });
  });

  test('independent oracle over every surah-to-surah range and random verse ranges', () => {
    // Recomputed from the raw dataset only: eighth starts as verse indices, no engine helper
    const ds = dataset();
    const counts = ds.surahs.map((s) => s.ayahCount as number);
    const off = [0];
    for (const c of counts) off.push(off[off.length - 1]! + c);
    const total = off[114]!;
    const at = (s: number, a: number) => off[s - 1]! + a;
    const starts = ds.eighthStarts.map((x) => at(x.surah as number, x.ayah as number));
    const endOf = (u: number) => (u + 1 < starts.length ? starts[u + 1]! : total + 1) - 1;
    const oracle = (s: number, e: number) => {
      const complete: number[] = [];
      for (let h = 0; h < 60; h++) if (starts[h * 8]! >= s && endOf(h * 8 + 7) <= e) complete.push(h);
      if (!complete.length) return { kind: 'unavailable' };
      const hs = starts[complete[0]! * 8]!, hz = endOf(complete[complete.length - 1]! * 8 + 7);
      let full = 0, touched = 0;
      for (let u = 0; u < starts.length; u++) {
        const a = starts[u]!, z = endOf(u);
        if (z < s || a > e || (a >= hs && z <= hz)) continue; // outside the range or inside the hizb block
        touched++;
        if (a >= s && z <= e) full++;
      }
      return full === touched
        ? { kind: 'exact', hizbs: complete.length, eighths: full }
        : { kind: 'bounded', hizbs: complete.length, eighths: { greaterThan: full, lessThan: touched } };
    };
    const ranges: [number, number][] = [];
    for (let a = 1; a <= 114; a++) for (let b = a; b <= 114; b++) ranges.push([at(a, 1), at(b, counts[b - 1]!)]);
    let seed = 42;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), 1 + (seed % n));
    for (let i = 0; i < 3000; i++) {
      const x = rnd(total), y = rnd(total);
      ranges.push([Math.min(x, y), Math.max(x, y)]);
    }
    for (const [s, e] of ranges) {
      const res = w({ from: ok(q.fromIndex(s)), to: ok(q.fromIndex(e)) });
      assert.deepEqual(shape(res.hizbsAndEighths), oracle(s, e), `${s}–${e}`);
      const x = res.hizbsAndEighths;
      if (x.kind === 'unavailable') continue;
      // same complete hizbs as hizbsAndPages
      assert.equal(res.hizbsAndPages.kind !== 'unavailable' && res.hizbsAndPages.hizbs, x.hizbs);
      // no double counting: 8 × hizbs + remainder is exactly the eighth measure of the whole range
      const lo = x.kind === 'exact' ? x.eighths : x.eighths.greaterThan, hi = x.kind === 'exact' ? x.eighths : x.eighths.lessThan;
      const m = res.eighths;
      assert.deepEqual(
        m.kind === 'exact' ? [m.value, m.value] : m.kind === 'bounded' ? [m.greaterThan, m.lessThan] : [],
        [8 * x.hizbs + lo, 8 * x.hizbs + hi],
      );
      assert.ok(hi - lo <= 2); // only the two outer ends can cut an eighth
    }
  });

  test('an unknown eighth boundary near the range: unavailable, never guessed', () => {
    const ds = dataset();
    const h10 = ds.eighthStarts.findIndex((x) => x.hizb === 10 && x.eighth === 1);
    ds.eighthStarts[h10 + 1]!.surah = null; // the second eighth of hizb 10
    ds.eighthStarts[h10 + 1]!.ayah = null;
    const e = createEngine(ds);
    const h9to10 = ok(e.unitRange('hizb', 9, 10)); // still exact hizbs, but the gap sits inside hizb 10
    assert.equal(w(h9to10, e).hizbsAndEighths.kind, 'exact'); // complete hizbs need hizb starts only
    const into10 = ok(e.unitRange('hizb', 9));
    const partial = { from: into10.from, to: ok(e.fromIndex(ok(e.toIndex(into10.to)) + 1)) }; // hizb 9 + a verse of hizb 10
    assert.equal(w(partial, e).hizbsAndEighths.kind, 'unavailable'); // which eighth ends there is unknown
    const ds2 = dataset();
    ds2.eighthStarts[h10]!.surah = null; // the START of hizb 10 itself
    ds2.eighthStarts[h10]!.ayah = null;
    const e2 = createEngine(ds2);
    assert.equal(w(r(1, 1, 114, 6), e2).hizbsAndEighths.kind, 'unavailable');
  });

  test('edition identity and reliability are carried; nothing is authoritative before print checks', () => {
    const res = w(r(9, 1, 9, 129));
    assert.equal(res.editionId, 'qalun-abi-nashit-tn-hannibal-mualim-v1');
    const x = res.hizbsAndEighths;
    assert.ok(x.kind !== 'unavailable' && STATUS_RANK.includes(x.dataStatus));
    assert.equal(res.authoritative, false);
  });

  test('deterministic', () => {
    assert.deepEqual(he(r(2, 1, 11, 123)), he(r(2, 1, 11, 123)));
  });
});

describe('approximate size in hizbs (presentation measure from the strict hizbs + eighths measures)', () => {
  const he = (range: VerseRange) => w(range).hizbEquivalent;
  const ex = (value: number): Measure => ({ kind: 'exact', value, touched: value, dataStatus: 'cross-checked' });
  const bd = (greaterThan: number, lessThan: number): Measure => ({ kind: 'bounded', greaterThan, lessThan, touched: lessThan, partialAtStart: true, partialAtEnd: true, dataStatus: 'cross-checked' });
  const notWhole = bd(0, 1);

  test('exact only for whole hizbs (strict boundaries): every single hizb, runs, juz 30, the whole Quran', () => {
    for (let h = 1; h <= 60; h++) assert.deepEqual(he(ok(q.unitRange('hizb', h))), { kind: 'exact', hizbs: 1 });
    assert.deepEqual(he(ok(q.unitRange('hizb', 3, 5))), { kind: 'exact', hizbs: 3 });
    assert.deepEqual(he(r(78, 1, 114, 6)), { kind: 'exact', hizbs: 2 });
    assert.deepEqual(he(r(1, 1, 114, 6)), { kind: 'exact', hizbs: 60 });
  });

  test('real Qalun examples', () => {
    // al-Baqara: hizb 1 is not complete (it starts at al-Fatiha) but its part in al-Baqara counts: 38 < x < 39 eighths
    assert.deepEqual(he(r(2, 1, 2, 286)), { kind: 'approximate', hizbs: 5, step: 0.5, eighths: { greaterThan: 38, lessThan: 39 } });
    // aṣ-Ṣāffāt → an-Nās: 124 < x < 125 eighths → about 16 hizbs (whole-hizb rounding from 10)
    assert.deepEqual(he(r(37, 1, 114, 6)), { kind: 'approximate', hizbs: 16, step: 1, eighths: { greaterThan: 124, lessThan: 125 } });
    // al-Fath → an-Nās: 73 < x < 74 eighths → about 9 hizbs
    assert.deepEqual(he(r(48, 1, 114, 6)), { kind: 'approximate', hizbs: 9, step: 0.5, eighths: { greaterThan: 73, lessThan: 74 } });
    // at-Tawba: exactly 17 eighths (both ends on eighth boundaries, not hizb boundaries) → about 2 hizbs
    assert.deepEqual(he(r(9, 1, 9, 129)), { kind: 'approximate', hizbs: 2, step: 0.5, eighths: { exact: 17 } });
    // a short range straddling a threshold: between, never one value chosen silently
    assert.deepEqual(he(r(19, 12, 19, 50)), { kind: 'between', from: 0, to: 0.5, step: 0.5, eighths: { greaterThan: 1, lessThan: 3 } });
  });

  test('partial first hizb, partial last hizb, both partial: never exact, rounded from the eighths bounds', () => {
    const h3 = ok(q.unitRange('hizb', 3, 4));
    const before = ok(q.fromIndex(ok(q.toIndex(h3.from)) - 1));
    const after = ok(q.fromIndex(ok(q.toIndex(h3.to)) + 1));
    for (const range of [{ from: before, to: h3.to }, { from: h3.from, to: after }, { from: before, to: after }]) {
      const x = he(range);
      assert.equal(x.kind, 'approximate', JSON.stringify(range));
      assert.equal(x.kind === 'approximate' && x.hizbs, 2);
    }
  });

  test('rounding: half hizbs below 10 hizbs, whole hizbs from 10, halves up, conservative across a threshold', () => {
    assert.deepEqual(hizbEquivalent(notWhole, ex(12)), { kind: 'approximate', hizbs: 1.5, step: 0.5, eighths: { exact: 12 } });
    assert.equal((hizbEquivalent(notWhole, ex(13)) as { hizbs: number }).hizbs, 1.5); // 1.625 → 1.5
    assert.equal((hizbEquivalent(notWhole, ex(14)) as { hizbs: number }).hizbs, 2); // 1.75 → 2 (halves up)
    assert.equal((hizbEquivalent(notWhole, ex(1)) as { hizbs: number }).hizbs, 0); // ⅛ → 0 (too small to be in hizbs)
    // bounded: a threshold ON a bound is not crossed (strict bounds)
    assert.deepEqual(hizbEquivalent(notWhole, bd(14, 16)), { kind: 'approximate', hizbs: 2, step: 0.5, eighths: { greaterThan: 14, lessThan: 16 } });
    assert.deepEqual(hizbEquivalent(notWhole, bd(12, 14)), { kind: 'approximate', hizbs: 1.5, step: 0.5, eighths: { greaterThan: 12, lessThan: 14 } });
    // a threshold strictly inside: between the two neighbours
    assert.deepEqual(hizbEquivalent(notWhole, bd(13, 15)), { kind: 'between', from: 1.5, to: 2, step: 0.5, eighths: { greaterThan: 13, lessThan: 15 } });
    // from 10 hizbs (80 eighths) whole hizbs; thresholds at 8k + 4
    assert.deepEqual(hizbEquivalent(notWhole, bd(80, 81)), { kind: 'approximate', hizbs: 10, step: 1, eighths: { greaterThan: 80, lessThan: 81 } });
    assert.equal((hizbEquivalent(notWhole, ex(84)) as { hizbs: number }).hizbs, 11); // 10.5 → 11
    assert.deepEqual(hizbEquivalent(notWhole, bd(83, 85)), { kind: 'between', from: 10, to: 11, step: 1, eighths: { greaterThan: 83, lessThan: 85 } });
    assert.equal((hizbEquivalent(notWhole, bd(79, 80)) as { hizbs: number }).hizbs, 10); // still halves: 79–80 → 10
    // the strict hizbs measure decides exactness; an unknown eighth boundary → unavailable
    assert.deepEqual(hizbEquivalent(ex(3), ex(24)), { kind: 'exact', hizbs: 3 });
    assert.equal(hizbEquivalent(notWhole, { kind: 'unavailable', reason: 'x' }).kind, 'unavailable');
  });

  test('every surah range and random ranges: consistent with the strict eighths bounds, never double counted', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), 1 + (seed % n));
    const ranges: VerseRange[] = [];
    for (let a = 1; a <= 114; a++) for (let b = a; b <= 114; b++) ranges.push(ok(q.surahRange(a, b)));
    for (let i = 0; i < 2000; i++) {
      const x = rnd(6236), y = rnd(6236);
      ranges.push({ from: ok(q.fromIndex(Math.min(x, y))), to: ok(q.fromIndex(Math.max(x, y))) });
    }
    for (const range of ranges) {
      const res = w(range);
      const x = res.hizbEquivalent, m = res.eighths;
      assert.ok(m.kind !== 'unavailable');
      const lo = m.kind === 'exact' ? m.value : m.greaterThan, hi = m.kind === 'exact' ? m.value : m.lessThan;
      if (x.kind === 'exact') {
        assert.equal(res.hizbs.kind, 'exact');
        assert.equal(x.hizbs * 8, lo); // whole hizbs = exactly 8 eighths each
      } else if (x.kind === 'approximate') {
        const half = (x.step * 8) / 2;
        // the rounded value is within half a step of EVERY possible true amount
        assert.ok(x.hizbs * 8 - half <= lo && hi <= x.hizbs * 8 + half, JSON.stringify(range));
      } else if (x.kind === 'between') {
        assert.equal(x.to - x.from, x.step);
        assert.ok(x.from * 8 <= hi && lo <= x.to * 8, JSON.stringify(range));
      } else assert.fail('unexpected unavailable');
    }
  });

  test('unknown eighth boundaries make it unavailable, never guessed', () => {
    const ds = dataset();
    const i = ds.eighthStarts.findIndex((x) => x.hizb === 10 && x.eighth === 3);
    ds.eighthStarts[i]!.surah = null;
    ds.eighthStarts[i]!.ayah = null;
    const e = createEngine(ds);
    // ends inside eighth 2 of hizb 10, whose end (the unknown start of eighth 3) is not known
    const eighth2 = ds.eighthStarts[i - 1]!;
    const range = { from: ok(e.unitRange('hizb', 9)).from, to: v(eighth2.surah as number, eighth2.ayah as number) };
    assert.equal(w(range, e).eighths.kind, 'unavailable');
    assert.equal(w(range, e).hizbEquivalent.kind, 'unavailable');
  });
});
