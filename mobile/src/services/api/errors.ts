/**
 * Every API failure becomes an ApiError with an Arabic message — same
 * contract as the web client (frontend/src/lib/api/errors.ts). The backend
 * answers `{ code, message }` with Arabic messages (backend/src/common/errors.ts,
 * auth.types.ts → AuthErrorCode); these are fallbacks for transport errors,
 * generic statuses and class-validator message arrays.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Validation details (class-validator), when present */
    readonly details: readonly string[] = [],
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** No HTTP answer at all (offline, DNS, refused connection, timeout). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

const CODE_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'تعذّر الاتصال بالخادم. تحقّق من الاتصال ثم أعد المحاولة.',
  TIMEOUT: 'استغرق الخادم وقتًا طويلًا للرد. يرجى إعادة المحاولة.',
  SESSION_EXPIRED: 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.',
  INVALID_CREDENTIALS: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  ACCOUNT_INACTIVE: 'هذا الحساب معطّل. يرجى التواصل مع إدارة الجمعية.',
  PASSWORD_CHANGE_REQUIRED: 'يجب تغيير كلمة المرور قبل المتابعة.',
  FORBIDDEN_ROLE: 'لا تملك صلاحية الوصول إلى هذه الصفحة.',
  TOO_MANY_REQUESTS: 'عدد كبير من المحاولات. يرجى الانتظار قليلًا ثم إعادة المحاولة.',
  FILE_TOO_LARGE: 'حجم الملف يتجاوز الحد المسموح.',
  FILE_TYPE_NOT_ALLOWED: 'نوع الملف غير مسموح به.',
  FILE_TYPE_MISMATCH: 'محتوى الملف لا يطابق نوعه أو امتداده.',
};

const STATUS_MESSAGES: Record<number, string> = {
  400: 'البيانات المرسلة غير صالحة.',
  401: CODE_MESSAGES.SESSION_EXPIRED,
  403: 'لا تملك صلاحية القيام بهذا الإجراء.',
  404: 'العنصر المطلوب غير موجود أو لم يعد متاحًا.',
  409: 'تعذّر تنفيذ العملية بسبب تعارض مع بيانات موجودة.',
  413: CODE_MESSAGES.FILE_TOO_LARGE,
  429: CODE_MESSAGES.TOO_MANY_REQUESTS,
  503: 'الخدمة غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
};

const GENERIC_MESSAGE = 'حدث خطأ غير متوقّع. يرجى إعادة المحاولة.';
const ARABIC = /[؀-ۿ]/;

/** Builds an ApiError from a failed response body (JSON or not). */
export function toApiError(status: number, body: unknown): ApiError {
  const record =
    body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof record.code === 'string' ? record.code : `HTTP_${status}`;
  const raw = record.message;
  const details = Array.isArray(raw)
    ? raw.filter((m): m is string => typeof m === 'string')
    : [];
  const serverMessage = typeof raw === 'string' && ARABIC.test(raw) ? raw : undefined;
  const arabicDetail = details.find((d) => ARABIC.test(d));
  const message =
    serverMessage ??
    arabicDetail ??
    CODE_MESSAGES[code] ??
    STATUS_MESSAGES[status] ??
    GENERIC_MESSAGE;
  return new ApiError(status, code, message, details, body);
}

export const networkError = (): ApiError =>
  new ApiError(0, 'NETWORK_ERROR', CODE_MESSAGES.NETWORK_ERROR);

export const timeoutError = (): ApiError =>
  new ApiError(0, 'TIMEOUT', CODE_MESSAGES.TIMEOUT);

export const sessionExpiredError = (): ApiError =>
  new ApiError(401, 'SESSION_EXPIRED', CODE_MESSAGES.SESSION_EXPIRED);

/** A user-facing Arabic message for any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_MESSAGE;
}
