import { badRequest } from '../common/errors.js';

/**
 * Image references of the CMS (Part 10.10): either a bundled website asset
 * of the frontend — /website/<name>.<svg|png|jpg|jpeg|webp>, exact pattern,
 * no other local path — or an UPLOADED file attached by id (…FileId fields,
 * validated by FilesService). External image URLs are no longer accepted
 * (no third-party hotlinking or tracking on the public site); blob:/data:
 * values must be uploaded through POST /api/files instead.
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

/** A bundled-asset image reference (null/undefined = none). */
export function assertMediaRef(
  field: string,
  value: string | null | undefined,
) {
  if (value === null || value === undefined) return;
  if (/^(blob|data):/i.test(value)) {
    throw badRequest(
      'CMS_MEDIA_UPLOAD_REQUIRED',
      'ارفع الصورة أولًا (POST /api/files?purpose=CMS_IMAGE) ثم أرسل معرّفها',
    );
  }
  if (!BUNDLED_ASSET.test(value)) throw unsafe(field);
}

/** A button / external link: an internal site route or an https:// URL. */
export function assertLink(field: string, value: string | null | undefined) {
  if (value === null || value === undefined) return;
  if (value.length > MAX_URL) throw unsafe(field);
  if (!SITE_ROUTE.test(value) && !httpsUrl(value)) throw unsafe(field);
}
