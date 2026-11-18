// node --test engine/engine.test.ts   (Node ≥ 23.6 runs TypeScript directly)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createEngine, compareWorkloads } from './engine.ts';
import type { ReferenceDataset, VerseRange, Workload, Measure } from './types.ts';

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
