#!/usr/bin/env node
/**
 * Generates the client Quran reference and copies the shared assignment rules into the web and
 * mobile apps — the apps never maintain their own copy of verse counts, page numbers or rules.
 *
 *   data/qalun-tn-v1.json ──► clients/quran-reference.data.ts (slim: counts, pages)
 *   clients/*.ts          ──► frontend/src/lib/quran-reference/*.ts
 *                         ──► mobile/src/features/quran-reference/*.ts
 *
 * Run: node quran-reference/scripts/sync-clients.mjs. Drift tests in each app (and in
 * tests/clients.test.mjs) fail when a copy differs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENTS = join(ROOT, 'clients');
const FILES = ['quran-reference.data.ts', 'work-assignment.ts'];
export const TARGETS = [join(ROOT, '..', 'frontend', 'src', 'lib', 'quran-reference'), join(ROOT, '..', 'mobile', 'src', 'features', 'quran-reference')];

/** clients/quran-reference.data.ts from the dataset. */
export function renderData() {
  const ds = JSON.parse(readFileSync(join(ROOT, 'data', 'qalun-tn-v1.json'), 'utf8'));
  const data = {
    editionId: ds.editionId,
    totalAyahs: ds.totalAyahs,
    ayahCounts: ds.surahs.map((s) => s.ayahCount),
    firstPage: ds.pageStarts[0].page,
    lastPage: ds.pageStarts.at(-1).page,
    pageStarts: ds.pageStarts.map((p) => [p.surah, p.ayah]),
  };
  return (
    `// GENERATED from quran-reference/data/qalun-tn-v1.json by quran-reference/scripts/sync-clients.mjs — do not edit.\n` +
    `/** The Quran reference the forms need: verse counts (Kufan, 6236) and the first verse of each printed page. */\n` +
    `export const QURAN_REFERENCE: {\n  editionId: string;\n  totalAyahs: number;\n  ayahCounts: readonly number[];\n  firstPage: number;\n  lastPage: number;\n  pageStarts: readonly (readonly [number, number])[];\n} = ${JSON.stringify(data)};\n`
  );
}

/** An app copy of a clients/ file: a header, ".ts" import specifiers removed (bundler resolution). */
export function renderCopy(name) {
  const src = readFileSync(join(CLIENTS, name), 'utf8');
  return (
    `// GENERATED copy of quran-reference/clients/${name} (scripts/sync-clients.mjs) — do not edit; change the source and re-run.\n` +
    src.replace(/from '\.\/([\w.-]+)\.ts'/g, "from './$1'")
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(CLIENTS, 'quran-reference.data.ts'), renderData());
  for (const dir of TARGETS) {
    mkdirSync(dir, { recursive: true });
    for (const name of FILES) writeFileSync(join(dir, name), renderCopy(name));
  }
  console.log('client Quran reference synced into', TARGETS.join(', '));
}
