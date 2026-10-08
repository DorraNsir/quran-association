import { badRequest } from '../common/errors.js';

/**
 * Media and link references accepted by the CMS until the file storage of
 * Part 10.10 exists. Nothing is uploaded or fabricated here:
 *
 *  - a bundled website asset of the frontend: /website/<name>.<svg|png|jpg|jpeg|webp>
 *    (exact pattern — no other local path, no traversal);
 *  - an absolute https:// URL (no credentials, no http, no other scheme).
 *
 * blob:/data: values (a browser-side upload preview) fail with
 * CMS_MEDIA_UNAVAILABLE: uploading needs the storage of Part 10.10.
 */
const BUNDLED_ASSET =
  /^\/website\/[a-z0-9][a-z0-9-]{0,60}\.(svg|png|jpe?g|webp)$/;

/** Internal site route for buttons: "/registration", "/programs#x", "/news?page=2". */
const SITE_ROUTE =
  /^\/(?!\/)[A-Za-z0-9\-._~/%]*(\?[A-Za-z0-9\-._~=&%]*)?(#[A-Za-z0-9\-._~]*)?$/;

const MAX_URL = 2000;

const unsafe = (field: string) =>
  badRequest('CMS_UNSAFE_URL', `رابط غير مقبول في الحقل «${field}»`);

function httpsUrl(value: string): boolean {
  if (value.length > MAX_URL) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    url.hostname.includes('.')
  );
}

/** An image reference (null/undefined = none). */
export function assertMediaRef(
  field: string,
  value: string | null | undefined,
) {
  if (value === null || value === undefined) return;
  if (/^(blob|data):/i.test(value)) {
    throw badRequest(
      'CMS_MEDIA_UNAVAILABLE',
      'رفع الصور غير متاح بعد (يتوفر مع خدمة تخزين الملفات): استعمل صورة من الموقع أو رابط https',
    );
  }
  if (!BUNDLED_ASSET.test(value) && !httpsUrl(value)) throw unsafe(field);
}

/** A button / external link: an internal site route or an https:// URL. */
export function assertLink(field: string, value: string | null | undefined) {
  if (value === null || value === undefined) return;
  if (value.length > MAX_URL) throw unsafe(field);
  if (!SITE_ROUTE.test(value) && !httpsUrl(value)) throw unsafe(field);
}
