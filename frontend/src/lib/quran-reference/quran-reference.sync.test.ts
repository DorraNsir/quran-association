import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { renderCopy } from "../../../../quran-reference/scripts/sync-clients.mjs"

/**
 * The web copy of the shared Quranic assignment rules and reference data must equal the source
 * (quran-reference/clients/). Fix a failure with `node quran-reference/scripts/sync-clients.mjs`.
 * Skipped where quran-reference/ is not checked out.
 */
const SOURCE = join(process.cwd(), "..", "quran-reference", "clients")

describe.skipIf(!existsSync(SOURCE))("generated Quran reference (web)", () => {
  it.each(["quran-reference.data.ts", "work-assignment.ts"])("%s is current", (name) => {
    expect(readFileSync(join(process.cwd(), "src", "lib", "quran-reference", name), "utf8")).toBe(renderCopy(name))
  })
})
