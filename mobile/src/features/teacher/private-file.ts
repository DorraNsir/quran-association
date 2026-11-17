import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { ApiError, apiUrl, getAuthBridge } from '@/services/api';

import type { ResourceFile } from './resource-types';

/*
 * Opening a PRIVATE resource file (GET /api/files/:id — authorized from the
 * resource and my CURRENT permissions; 404 otherwise; Cache-Control:
 * private, no-store). The backend URL can never be handed to a browser: it
 * needs the Bearer header. So:
 *  1. download it WITH the header (never a token in the URL, never logged);
 *     on 401, ONE refresh (the auth bridge, single-flight) then one retry;
 *  2. into the app's CACHE directory only, one file at a time (the previous
 *     copy is removed first; the OS may purge the cache) — never Documents,
 *     never the gallery;
 *  3. hand it to the platform viewer (iOS Quick Look / Android "open with");
 *     without a viewer, the system share sheet.
 */
const FOLDER = 'resource-files';

export type OpenFileError = 'offline' | 'unavailable' | 'expired' | 'noViewer' | 'unknown';

export class FileOpenError extends Error {
  constructor(readonly kind: OpenFileError) {
    super(kind);
    this.name = 'FileOpenError';
  }
}

/** A file name safe for the cache folder (the server's name is only a display name). */
export function safeFileName(file: Pick<ResourceFile, 'id' | 'fileName'>): string {
  const cleaned = file.fileName.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').trim();
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned.slice(0, 120) : `file-${file.id}`;
}

/** "HTTP 404" in the native download error → 404; no status → null (a network failure). */
export function statusOfDownloadError(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /HTTP\s+(\d{3})/.exec(message);
  return match ? Number(match[1]) : null;
}

async function download(file: ResourceFile, destination: File): Promise<File> {
  const bridge = getAuthBridge();
  const attempt = () => {
    const token = bridge?.getAccessToken();
    if (!token) throw new FileOpenError('expired');
    return File.downloadFileAsync(apiUrl(file.url), destination, {
      headers: { Authorization: `Bearer ${token}` },
      idempotent: true,
    });
  };
  try {
    return await attempt();
  } catch (error) {
    if (error instanceof FileOpenError) throw error;
    const status = statusOfDownloadError(error);
    if (status === 401 && bridge) {
      // Network / server failures of the refresh propagate: offline ≠ signed out
      let outcome: 'renewed' | 'expired';
      try {
        outcome = await bridge.refresh();
      } catch {
        throw new FileOpenError('offline');
      }
      if (outcome === 'expired') {
        bridge.onSessionEnded('expired');
        throw new FileOpenError('expired');
      }
      try {
        return await attempt();
      } catch (retryError) {
        throw toOpenError(retryError);
      }
    }
    throw toOpenError(error);
  }
}

function toOpenError(error: unknown): FileOpenError {
  if (error instanceof FileOpenError) return error;
  const status = statusOfDownloadError(error);
  if (status === 404 || status === 403) return new FileOpenError('unavailable');
  if (status === 401) return new FileOpenError('expired');
  if (status === null) return new FileOpenError('offline');
  return new FileOpenError('unknown');
}

/** Removes every cached copy: done before each new download, so at most one private file is kept (the OS may purge it earlier). */
export function clearCachedFiles(): void {
  try {
    const folder = new Directory(Paths.cache, FOLDER);
    if (folder.exists) folder.delete();
  } catch {
    // Nothing to clean, or already removed by the OS
  }
}

/** Downloads (authenticated) then opens a private file. Throws FileOpenError. */
export async function openPrivateFile(file: ResourceFile, title: string): Promise<void> {
  clearCachedFiles();
  const folder = new Directory(Paths.cache, FOLDER, file.id);
  try {
    folder.create({ intermediates: true, idempotent: true });
  } catch {
    throw new FileOpenError('unknown');
  }
  const local = await download(file, new File(folder, safeFileName(file)));
  try {
    if (await local.canPreview({ mimeType: file.mimeType })) {
      await local.preview({ title, mimeType: file.mimeType });
      return;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(local.uri, { mimeType: file.mimeType, dialogTitle: title });
      return;
    }
  } catch {
    throw new FileOpenError('noViewer');
  }
  throw new FileOpenError('noViewer');
}

/** For the screens: a FileOpenError kind, or an ApiError mapped the same way. */
export function openErrorKind(error: unknown): OpenFileError {
  if (error instanceof FileOpenError) return error.kind;
  if (error instanceof ApiError) return error.isNetwork ? 'offline' : error.isNotFound ? 'unavailable' : 'unknown';
  return 'unknown';
}

