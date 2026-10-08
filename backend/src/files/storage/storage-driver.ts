import type { Readable } from 'node:stream';

/**
 * Where file BYTES live. Keys are opaque, server-generated
 * ("ab/cd/<uuid>"); nothing outside the driver knows real locations.
 * An object-storage driver (S3-compatible…) can implement the same
 * interface later; only the local private filesystem driver exists now.
 */
export interface StorageDriver {
  /** A fresh temporary location for an incoming upload (local path). */
  readonly tempDir: string;
  /** Moves a validated temporary file to `key`; never overwrites an existing object. */
  commit(tempPath: string, key: string): Promise<void>;
  /** Size of the stored object, or null if it is missing. */
  size(key: string): Promise<number | null>;
  open(key: string): Readable;
  /** Idempotent: a missing object is not an error. */
  remove(key: string): Promise<void>;
  /** Removes a temporary file (idempotent). */
  discard(tempPath: string): Promise<void>;
  /** Stored keys last modified before `before` (orphan sweep). */
  listKeys(before: Date): Promise<string[]>;
  /** Temporary files older than `before` (abandoned uploads). */
  listStaleTemp(before: Date): Promise<string[]>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/** Server-generated key shape (also enforced by a DB CHECK). */
export const STORAGE_KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f-]{36}$/;
