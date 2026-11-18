import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render } from '../../scripts/sync-quran-reference.mjs';

/**
 * The generated copy must equal what the generator makes from quran-reference/ (the single
 * authoritative source). Fix a failure with `npm run quran:sync` — never by editing generated/.
 * Skipped where quran-reference/ is absent (e.g. a backend-only Docker build context).
 */
const SOURCE = join(__dirname, '..', '..', '..', 'quran-reference');
const TARGET = join(__dirname, 'generated');

describe.skipIf(!existsSync(SOURCE))('generated Quran reference', () => {
  it('is identical to the output of scripts/sync-quran-reference.mjs', () => {
    const files = render();
    expect(Object.keys(files).sort()).toEqual([
      'engine.ts',
      'meta.ts',
      'qalun-tn-v1.data.ts',
      'types.ts',
    ]);
    for (const [name, content] of Object.entries(files))
      expect(readFileSync(join(TARGET, name), 'utf8'), name).toBe(content);
  });
});
