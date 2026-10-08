/**
 * Content-based type detection for the upload allowlist ONLY. The client's
 * filename, extension and declared MIME type are never trusted: the type is
 * decided from the first bytes (magic numbers). Anything not recognised here
 * is refused — including SVG, HTML, archives and executables.
 */
export type DetectedType = {
  mimeType: AllowedMime;
  kind: FileKind;
  /** Extensions a client filename may carry for this type */
  extensions: string[];
};

export type FileKind = 'IMAGE' | 'PDF' | 'AUDIO';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

/** Bytes needed to recognise every allowlisted type. */
export const SIGNATURE_BYTES = 16;

const ascii = (head: Uint8Array, offset: number, text: string) =>
  text.split('').every((c, i) => head[offset + i] === c.charCodeAt(0));

export function detectFileType(head: Uint8Array): DetectedType | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return {
      mimeType: 'image/jpeg',
      kind: 'IMAGE',
      extensions: ['jpg', 'jpeg'],
    };
  if (
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (b, i) => head[i] === b,
    )
  )
    return { mimeType: 'image/png', kind: 'IMAGE', extensions: ['png'] };
  if (ascii(head, 0, 'RIFF') && ascii(head, 8, 'WEBP'))
    return { mimeType: 'image/webp', kind: 'IMAGE', extensions: ['webp'] };
  if (ascii(head, 0, '%PDF-'))
    return { mimeType: 'application/pdf', kind: 'PDF', extensions: ['pdf'] };
  // MP3: an ID3v2 tag, or an MPEG audio Layer III frame header
  if (
    ascii(head, 0, 'ID3') ||
    (head[0] === 0xff &&
      (head[1] & 0xe0) === 0xe0 &&
      ((head[1] >> 1) & 0x03) === 0x01)
  )
    return { mimeType: 'audio/mpeg', kind: 'AUDIO', extensions: ['mp3'] };
  // M4A: an ISO-BMFF "ftyp" box whose major brand is M4A (audio-only MPEG-4)
  if (ascii(head, 4, 'ftyp') && ascii(head, 8, 'M4A '))
    return { mimeType: 'audio/mp4', kind: 'AUDIO', extensions: ['m4a'] };
  return null;
}

/**
 * A display name safe for Content-Disposition: the last path segment only,
 * no control/separator characters, bounded length. Never used as a path.
 */
export function sanitizeFileName(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = Array.from(base.normalize('NFC'))
    // No control characters, quotes or characters reserved by filesystems
    .filter(
      (c) => c.charCodeAt(0) > 0x1f && c !== '\u007f' && !'"<>|:*?'.includes(c),
    )
    .join('')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 150);
  return cleaned || 'file';
}

/** Lower-case extension of a client filename ('' when none). */
export const extensionOf = (name: string) => {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return match ? match[1].toLowerCase() : '';
};
