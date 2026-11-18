// Boundaries read a SECOND time, independently of the extraction (blind, from other parts of the page,
// at higher resolution). A wrong boundary in the dataset fails here even if the dataset stays
// internally consistent. Sources: data/readings/independent_*.csv (see reports/independent-verification.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ds = JSON.parse(readFileSync(new URL('../data/qalun-tn-v1.json', import.meta.url), 'utf8'));
const csv = (name) => {
  const [head, ...lines] = readFileSync(new URL(`../data/readings/${name}`, import.meta.url), 'utf8').trim().split('\n');
  const keys = head.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').slice(0, keys.length).map((v, i) => [keys[i], v])));
};

test('71 page starts re-read from the TOP of each page match the dataset', () => {
  const tops = csv('independent_tops.csv');
  assert.equal(tops.length, 71);
  for (const t of tops) {
    const p = ds.pageStarts[Number(t.printed) - 2];
    assert.equal(p.ayah, Number(t.start_ayah), `printed page ${t.printed}`);
  }
});

test('the 28 quarters that differ from Hafs, re-read blind at 200 dpi, match the dataset', () => {
  const qs = csv('independent_quarters.csv');
  assert.equal(qs.length, 28);
  for (const q of qs) {
    const d = ds.quarterStarts[Number(q.quarter) - 1];
    assert.deepEqual([d.surah, d.ayah], [Number(q.surah), Number(q.ayah)], `quarter ${q.quarter}`);
  }
});

test('margin medallion labels agree with the quarter position in its hizb', () => {
  const expected = { 1: 'حزب', 2: 'ربع-type', 3: 'نصف', 4: 'ربع-type' };
  for (const q of csv('independent_quarters.csv')) {
    if (q.medallion_label.startsWith('(')) continue; // not visible in the crop
    const d = ds.quarterStarts[Number(q.quarter) - 1];
    assert.equal(q.medallion_label, expected[d.quarterInHizb], `quarter ${q.quarter}`);
  }
});

// Fixed points read directly from the PDF during the independent pass (not derived from the dataset)
const FIXED = [
  ['page', 2, 1, 1], ['page', 3, 2, 6], ['page', 22, 2, 142], ['page', 592, 87, 15], ['page', 604, 112, 1],
  ['page', 262, 15, 1], ['page', 532, 55, 17], ['page', 452, 37, 154],
  ['quarter', 25, 3, 92], ['quarter', 89, 11, 1], ['quarter', 163, 30, 30], ['quarter', 240, 101, 1],
];
test('fixed points from the PDF', () => {
  for (const [kind, n, s, a] of FIXED) {
    const d = kind === 'page' ? ds.pageStarts[n - 2] : ds.quarterStarts[n - 1];
    assert.deepEqual([d.surah, d.ayah], [s, a], `${kind} ${n}`);
  }
});

test('surah counts: al-Ahzab 73 and the edition total 6236', () => {
  assert.equal(ds.surahs[32].ayahCount, 73);
  assert.equal(ds.surahs.reduce((t, s) => t + s.ayahCount, 0), 6236);
});
