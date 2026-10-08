import { assertLink, assertMediaRef } from './media.js';

const code = (fn: () => void) => {
  try {
    fn();
    return 'OK';
  } catch (error) {
    return (error as { getResponse(): { code: string } }).getResponse().code;
  }
};

describe('CMS media and link references', () => {
  it('accepts bundled website assets only (uploads are attached by file id)', () => {
    for (const ok of [
      '/website/halaqa.svg',
      '/website/hero-1.webp',
      null,
      undefined,
    ])
      expect(code(() => assertMediaRef('imageUrl', ok))).toBe('OK');
    for (const bad of [
      'http://example.org/a.jpg',
      'javascript:alert(1)',
      'file:///etc/passwd',
      '/etc/passwd',
      '/website/../.env',
      '/website/a.exe',
      '../website/a.svg',
      '//evil.org/a.jpg',
      'https://user:pass@example.org/a.jpg',
      'https://localhost/a.jpg',
      'ftp://example.org/a.jpg',
      'image.jpg',
      'https://cdn.example.org/a/b.jpg',
    ])
      expect([bad, code(() => assertMediaRef('imageUrl', bad))]).toEqual([
        bad,
        'CMS_UNSAFE_URL',
      ]);
  });

  it('asks for a real upload instead of browser previews', () => {
    expect(code(() => assertMediaRef('imageUrl', 'blob:http://x/1'))).toBe(
      'CMS_MEDIA_UPLOAD_REQUIRED',
    );
    expect(
      code(() => assertMediaRef('imageUrl', 'data:image/png;base64,AAAA')),
    ).toBe('CMS_MEDIA_UPLOAD_REQUIRED');
  });

  it('accepts internal routes or https links for buttons', () => {
    for (const ok of [
      '/registration',
      '/programs#children',
      '/news?page=2',
      '/',
      'https://example.org/x',
    ])
      expect(code(() => assertLink('ctaHref', ok))).toBe('OK');
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '//evil.org',
      'http://example.org',
      'data:text/html,x',
      '/a b',
      'registration',
      'mailto:x@y.tn',
    ])
      expect([bad, code(() => assertLink('ctaHref', bad))]).toEqual([
        bad,
        'CMS_UNSAFE_URL',
      ]);
  });
});
