import type { Response } from 'express';
import type { Readable } from 'node:stream';

/**
 * Streams a stored file with safe headers: the DETECTED type, nosniff, a
 * sandboxing CSP (an allowlisted type is never active content anyway), an
 * RFC 6266 Content-Disposition (ASCII fallback + UTF-8 name), and caching
 * per access level — private: never stored by shared caches; public: a
 * short max-age so hiding/replacing content takes effect quickly.
 */
export function sendFile(
  res: Response,
  file: {
    mimeType: string;
    size: number;
    checksum: string;
    originalName: string;
    stream: () => Readable;
  },
  options: { public: boolean; download?: boolean; ifNoneMatch?: string },
) {
  const etag = `"${file.checksum}"`;
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader(
    'Cache-Control',
    options.public ? 'public, max-age=300' : 'private, no-store',
  );
  res.setHeader('ETag', etag);
  if (options.ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }
  const ascii = file.originalName
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  res.setHeader(
    'Content-Disposition',
    `${options.download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
  );
  res.setHeader('Content-Length', String(file.size));
  const stream = file.stream();
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
