// Node's fs through Jest (the app's tsconfig loads no Node types); Jest runs from mobile/
const { existsSync, readFileSync } = jest.requireActual('fs') as {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: 'utf8') => string;
};

/**
 * The mobile copy of the shared Quranic assignment rules and reference data must equal the source
 * quran-reference/clients/ as written by quran-reference/scripts/sync-clients.mjs (header + ".ts"
 * specifiers removed). Fix a failure with `node quran-reference/scripts/sync-clients.mjs`.
 */
const SOURCE = '../quran-reference/clients';
const copyOf = (name: string) =>
  `// GENERATED copy of quran-reference/clients/${name} (scripts/sync-clients.mjs) — do not edit; change the source and re-run.\n` +
  readFileSync(`${SOURCE}/${name}`, 'utf8').replace(/from '\.\/([\w.-]+)\.ts'/g, "from './$1'");

(existsSync(SOURCE) ? describe : describe.skip)('generated Quran reference (mobile)', () => {
  it.each(['quran-reference.data.ts', 'work-assignment.ts'])('%s is current', (name) => {
    expect(readFileSync(`src/features/quran-reference/${name}`, 'utf8')).toBe(copyOf(name));
  });
});
