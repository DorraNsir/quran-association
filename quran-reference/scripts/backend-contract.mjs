#!/usr/bin/env node
/**
 * Records what the REAL backend makes of assignment requests (backend/dist, built by
 * `npm run build` in backend/) into clients/fixtures/backend-contract.json. The client tests then
 * check the shared client module against it (canonical ranges, default wording, precision).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { resolveAssignment, describeAssignment } = await import(join(here, '..', '..', 'backend', 'dist', 'quran-reference', 'quran-assignment.js'));

const CASES = [
  ['MEMORIZATION', { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 20 }],
  ['MEMORIZATION', { kind: 'AYAH_RANGE', fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 }],
  ['MEMORIZATION', { kind: 'PAGE_RANGE', fromPage: 10, toPage: 12 }],
  ['MEMORIZATION', { kind: 'PAGE_RANGE', fromPage: 48, toPage: 52 }],
  ['MEMORIZATION', { kind: 'PAGE_RANGE', fromPage: 592, toPage: 592 }],
  // حفظ modes: whole surah (no verse), one verse (no ending verse), one page (no ending page)
  ['MEMORIZATION', { kind: 'AYAH_RANGE', fromSurah: 110, toSurah: 110 }],
  ['MEMORIZATION', { kind: 'AYAH_RANGE', fromSurah: 2, toSurah: 2 }],
  ['MEMORIZATION', { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 255, toSurah: 2 }],
  ['MEMORIZATION', { kind: 'AYAH_RANGE', fromSurah: 2, fromAyah: 255, toSurah: 2, toAyah: 260 }],
  ['MEMORIZATION', { kind: 'PAGE_RANGE', fromPage: 79 }],
  ['MEMORIZATION', { kind: 'PAGE_RANGE', fromPage: 79, toPage: 82 }],
  ['REVISION', { kind: 'SURAH_RANGE', fromSurah: 78, toSurah: 114 }],
  ['REVISION', { kind: 'SURAH_RANGE', fromSurah: 2, toSurah: 3 }],
  ['EXAM', { kind: 'SURAH_RANGE', fromSurah: 46, toSurah: 114 }],
  ['EXAM', { kind: 'SURAH_RANGE', fromSurah: 2, fromAyah: 142, toSurah: 3, toAyah: 91 }],
  ['REVISION', { kind: 'SURAH_RANGE', fromSurah: 9 }],
  ['EXAM', { kind: 'SURAH_RANGE', fromSurah: 9, toSurah: 24 }],
  ['EXAM', { kind: 'SURAH_RANGE', fromSurah: 9, fromAyah: 10, toAyah: 40 }],
  ['REVISION', { kind: 'SURAH_RANGE', fromSurah: 2, toSurah: 18 }],
  ['RECITATION', { kind: 'SURAH_RANGE', fromSurah: 55, toSurah: 55 }],
  ['RECITATION', { kind: 'SURAH_RANGE', fromSurah: 36, toSurah: 36 }],
];

const cases = CASES.map(([type, payload]) => {
  const s = resolveAssignment(type, payload);
  return {
    type,
    payload,
    // The response form (backend work-followup.service assignmentOf)
    assignment: {
      kind: s.quranAssignmentKind,
      editionId: s.quranEditionId,
      fromSurah: s.quranFromSurah,
      fromAyah: s.quranFromAyah,
      toSurah: s.quranToSurah,
      toAyah: s.quranToAyah,
      fromPage: s.quranFromPage,
      toPage: s.quranToPage,
    },
    workload: s.quranWorkload,
    defaultDescription: describeAssignment(type, s, type === 'RECITATION' ? 'الثانية' : null),
  };
});
writeFileSync(join(here, '..', 'clients', 'fixtures', 'backend-contract.json'), JSON.stringify(cases, null, 1) + '\n');
console.log(cases.length, 'backend contract cases written');
