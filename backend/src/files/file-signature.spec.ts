import {
  detectFileType,
  extensionOf,
  sanitizeFileName,
} from './file-signature.js';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) =>
      typeof p === 'string' ? p.split('').map((c) => c.charCodeAt(0)) : p,
    ),
  );

describe('file signatures', () => {
  it('recognises exactly the allowlisted types from their content', () => {
    expect(detectFileType(bytes([0xff, 0xd8, 0xff, 0xe0]))?.mimeType).toBe(
      'image/jpeg',
    );
    expect(
      detectFileType(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))?.mimeType,
    ).toBe('image/png');
    expect(
      detectFileType(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))?.mimeType,
    ).toBe('image/webp');
    expect(detectFileType(bytes('%PDF-1.7'))?.kind).toBe('PDF');
    expect(detectFileType(bytes('ID3', [4, 0]))?.mimeType).toBe('audio/mpeg');
    expect(detectFileType(bytes([0xff, 0xfb, 0x90, 0x64]))?.mimeType).toBe(
      'audio/mpeg',
    );
    expect(detectFileType(bytes([0, 0, 0, 0x20], 'ftypM4A '))?.mimeType).toBe(
      'audio/mp4',
    );
  });

  it('refuses everything else (SVG, HTML, archives, executables, video MP4)', () => {
    for (const head of [
      bytes('<svg xmlns="http://www.w3.org/2000/svg">'),
      bytes('<!DOCTYPE html><html>'),
      bytes('<script>alert(1)</script>'),
      bytes('PK', [3, 4]),
      bytes('MZ', [0x90, 0]),
      bytes([0x7f], 'ELF'),
      bytes('GIF89a'),
      bytes([0, 0, 0, 0x20], 'ftypisom'),
      bytes('plain text'),
      bytes(),
    ])
      expect(detectFileType(head)).toBeNull();
  });

  it('sanitizes display names (never a path)', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\temp\\درس.pdf')).toBe('درس.pdf');
    expect(sanitizeFileName('a"b<c>.pdf')).toBe('abc.pdf');
    expect(sanitizeFileName('...hidden')).toBe('hidden');
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName('x'.repeat(300)).length).toBe(150);
    expect(extensionOf('درس.PDF')).toBe('pdf');
    expect(extensionOf('noext')).toBe('');
  });
});
