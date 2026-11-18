// Validation of the candidate Qalun (Tunisia) reference dataset — node --test tests/dataset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ds = JSON.parse(readFileSync(new URL('../data/qalun-tn-v1.json', import.meta.url), 'utf8'));
const counts = ds.surahs.map((s) => s.ayahCount);
const STATUSES = new Set(['cross-checked', 'consistent', 'needs-review', 'verified']);

/** Global position of a verse in Mushaf order (1 … totalAyahs). */
const offsets = counts.reduce((acc, c, i) => (acc.push(acc[i] + c), acc), [0]);
const position = (s, a) => offsets[s - 1] + a;
const valid = (s, a) => Number.isInteger(s) && s >= 1 && s <= 114 && Number.isInteger(a) && a >= 1 && a <= counts[s - 1];

test('edition identity and provenance', () => {
  assert.equal(ds.riwaya, 'QALUN');
  assert.equal(ds.tariq, 'ABI_NASHIT');
  assert.equal(ds.countingSystem, 'KUFI');
  assert.match(ds.source.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(ds.source.quranPdfPages, [3, 605]);
});

test('exactly 114 surahs, numbered 1…114, every count a positive integer', () => {
  assert.equal(ds.surahs.length, 114);
  ds.surahs.forEach((s, i) => {
    assert.equal(s.surah, i + 1);
    assert.ok(Number.isInteger(s.ayahCount) && s.ayahCount > 0, `surah ${s.surah}`);
  });
});

test('verse total = 6236, the Kufan count stated by the edition', () => {
  assert.equal(counts.reduce((a, b) => a + b, 0), 6236);
  assert.equal(ds.totalAyahs, 6236);
});

test('Kufan-count markers: al-Fatiha 7 (basmala counted), al-Baqara 286 («الم» counted)', () => {
  assert.equal(counts[0], 7);
  assert.equal(counts[1], 286);
});

test('every title-frame count agrees with the last verse number read', () => {
  for (const s of ds.surahs) if (s.titleCount != null) assert.equal(s.titleCount, s.ayahCount, `surah ${s.surah}`);
});

test('603 page starts: printed pages 2…604, PDF page = printed + 1, one start per page', () => {
  assert.equal(ds.pageStarts.length, 603);
  ds.pageStarts.forEach((p, i) => {
    assert.equal(p.page, i + 2);
    assert.equal(p.pdfPage, p.page + 1);
  });
  assert.equal(new Set(ds.pageStarts.map((p) => p.page)).size, 603);
});

test('page starts are valid verses, strictly increasing, no duplicate position', () => {
  let prev = 0;
  for (const p of ds.pageStarts) {
    assert.ok(valid(p.surah, p.ayah), `page ${p.page}`);
    const g = position(p.surah, p.ayah);
    assert.ok(g > prev, `page ${p.page} not after the previous page`);
    prev = g;
  }
});

test('first page begins at 1:1; the last page holds an-Nas to its final verse 114:6', () => {
  assert.deepEqual([ds.pageStarts[0].surah, ds.pageStarts[0].ayah], [1, 1]);
  const last = ds.pageStarts.at(-1);
  assert.ok(position(last.surah, last.ayah) <= position(114, 1));
  assert.equal(counts[113], 6);
});

test('juz in the page header never decreases and covers 1…30', () => {
  let prev = 1;
  for (const p of ds.pageStarts) {
    assert.ok(p.juzInHeader >= prev && p.juzInHeader <= prev + 1, `page ${p.page}`);
    prev = p.juzInHeader;
  }
  assert.equal(prev, 30);
});

test('480 eighths: hizb 1…60 × eighth 1…8, valid, strictly increasing', () => {
  assert.equal(ds.eighthStarts.length, 480);
  let prev = 0;
  ds.eighthStarts.forEach((e, i) => {
    assert.equal(e.index, i + 1);
    assert.equal(e.hizb, Math.floor(i / 8) + 1);
    assert.equal(e.eighth, (i % 8) + 1);
    assert.ok(valid(e.surah, e.ayah), `eighth ${e.index}`);
    const g = position(e.surah, e.ayah);
    assert.ok(g > prev, `eighth ${e.index} not after the previous one`);
    prev = g;
  });
});

test('the hizb number printed in every marker matches its place in the sequence', () => {
  for (const e of ds.eighthStarts) assert.equal(e.hizbNumberInMarker, e.hizb, `eighth ${e.index}`);
});

test('every marker lies on its page: between that page start and the next page start', () => {
  for (const e of ds.eighthStarts) {
    const i = e.page - 2;
    const start = position(ds.pageStarts[i].surah, ds.pageStarts[i].ayah);
    const next = i + 1 < 603 ? position(ds.pageStarts[i + 1].surah, ds.pageStarts[i + 1].ayah) : 6237;
    const g = position(e.surah, e.ayah);
    assert.ok(g >= start && g < next, `eighth ${e.index} not on page ${e.page}`);
  }
});

test('240 quarters and 60 hizbs are the matching eighths', () => {
  assert.equal(ds.quarterStarts.length, 240);
  assert.equal(ds.hizbStarts.length, 60);
  ds.quarterStarts.forEach((q, i) => {
    const e = ds.eighthStarts[2 * i];
    assert.deepEqual([q.quarter, q.surah, q.ayah], [i + 1, e.surah, e.ayah]);
  });
  ds.hizbStarts.forEach((h, i) => {
    const e = ds.eighthStarts[8 * i];
    assert.deepEqual([h.hizb, h.surah, h.ayah], [i + 1, e.surah, e.ayah]);
  });
  assert.deepEqual([ds.hizbStarts[0].surah, ds.hizbStarts[0].ayah], [1, 1]);
});

test('a juz starts on a page whose header shows that juz (or the next page)', () => {
  for (let j = 1; j <= 30; j++) {
    const h = ds.hizbStarts[2 * (j - 1)];
    const here = ds.pageStarts[h.page - 2].juzInHeader;
    const next = ds.pageStarts[h.page - 1]?.juzInHeader;
    assert.ok(here === j || next === j, `juz ${j}`);
  }
});

test('every entry has provenance and a known status; nothing is marked verified yet', () => {
  for (const r of [...ds.surahs, ...ds.pageStarts, ...ds.eighthStarts]) {
    assert.ok(STATUSES.has(r.status));
    assert.notEqual(r.status, 'verified');
    assert.ok(typeof r.evidence === 'string' && r.evidence.length > 0);
  }
  for (const r of [...ds.pageStarts, ...ds.eighthStarts]) assert.ok(Number.isInteger(r.pdfPage));
});

test('known open item: al-Ahzab title count is flagged for review', () => {
  assert.equal(ds.surahs[32].status, 'needs-review');
});
