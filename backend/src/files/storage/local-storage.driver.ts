import { createReadStream, mkdirSync } from 'node:fs';
import { link, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

import { STORAGE_KEY_PATTERN, type StorageDriver } from './storage-driver.js';

const PRIVATE_DIR = 0o700;

/**
 * Private local filesystem storage under FILE_STORAGE_ROOT (resolved
 * against the working directory). Never served statically: bytes leave only
 * through the authorized download endpoints. Suitable for development and a
 * SINGLE API instance with a persistent, backed-up volume — not for several
 * instances without shared storage (use an object-storage driver then).
 */
export class LocalStorageDriver implements StorageDriver {
  readonly root: string;
  readonly tempDir: string;

  constructor(configuredRoot: string) {
    this.root = resolve(process.cwd(), configuredRoot);
    if (this.root === sep || this.root === resolve(process.cwd())) {
      throw new Error(
        'FILE_STORAGE_ROOT must be a dedicated directory (not the filesystem root nor the working directory)',
      );
    }
    this.tempDir = join(this.root, '.tmp');
    mkdirSync(this.tempDir, { recursive: true, mode: PRIVATE_DIR });
  }

  /** Absolute path of a key — refuses anything that is not a server key inside the root. */
  private pathOf(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep))
      throw new Error('Invalid storage key');
    return path;
  }

  private tempPathOf(tempPath: string): string {
    const path = resolve(tempPath);
    if (!path.startsWith(this.tempDir + sep))
      throw new Error('Invalid temporary path');
    return path;
  }

  async commit(tempPath: string, key: string): Promise<void> {
    const target = this.pathOf(key);
    await mkdir(dirname(target), { recursive: true, mode: PRIVATE_DIR });
    // link() fails with EEXIST: an existing object is never overwritten
    await link(this.tempPathOf(tempPath), target);
    await this.discard(tempPath);
  }

  async size(key: string): Promise<number | null> {
    try {
      const info = await stat(this.pathOf(key));
      return info.isFile() ? info.size : null;
    } catch {
      return null;
    }
  }

  open(key: string): Readable {
    return createReadStream(this.pathOf(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.pathOf(key)).catch(ignoreMissing);
  }

  async discard(tempPath: string): Promise<void> {
    await unlink(this.tempPathOf(tempPath)).catch(ignoreMissing);
  }

  async listKeys(before: Date): Promise<string[]> {
    const keys: string[] = [];
    for (const a of await safeReaddir(this.root)) {
      if (!/^[0-9a-f]{2}$/.test(a)) continue;
      for (const b of await safeReaddir(join(this.root, a))) {
        if (!/^[0-9a-f]{2}$/.test(b)) continue;
        for (const name of await safeReaddir(join(this.root, a, b))) {
          const key = `${a}/${b}/${name}`;
          if (!STORAGE_KEY_PATTERN.test(key)) continue;
          const info = await stat(this.pathOf(key)).catch(() => null);
          if (info?.isFile() && info.mtime < before) keys.push(key);
        }
      }
    }
    return keys;
  }

  async listStaleTemp(before: Date): Promise<string[]> {
    const stale: string[] = [];
    for (const name of await safeReaddir(this.tempDir)) {
      const path = join(this.tempDir, name);
      const info = await stat(path).catch(() => null);
      if (info?.isFile() && info.mtime < before) stale.push(path);
    }
    return stale;
  }
}

function ignoreMissing(error: NodeJS.ErrnoException) {
  if (error.code !== 'ENOENT') throw error;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
