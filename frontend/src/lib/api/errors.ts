/**
 * Every API failure becomes an ApiError with an Arabic message. The backend
 * already answers {code, message} in Arabic; these are fallbacks for
 * transport errors, generic statuses and validation arrays.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Validation details (class-validator), when present */
    readonly details: string[] = [],
    readonly body?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }

  get isUnauthorized() {
    return this.status === 401
  }
  get isForbidden() {
    return this.status === 403
  }
  get isNotFound() {
    return this.status === 404
  }
}

/** Arabic messages for codes whose server wording is not enough for the UI, and generic fallbacks. */
const CODE_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: "تعذّر الاتصال بالخادم. تحقّق من الاتصال ثم أعد المحاولة.",
  SESSION_EXPIRED: "انتهت الجلسة. يرجى تسجيل الدخول من جديد.",
  INVALID_CREDENTIALS: "اسم المستخدم أو كلمة المرور غير صحيحة.",
  ACCOUNT_INACTIVE: "هذا الحساب معطّل. يرجى التواصل مع إدارة الجمعية.",
  PASSWORD_CHANGE_REQUIRED: "يجب تغيير كلمة المرور قبل المتابعة.",
  FORBIDDEN_ROLE: "لا تملك صلاحية الوصول إلى هذه الصفحة.",
  TOO_MANY_REQUESTS: "عدد كبير من المحاولات. يرجى الانتظار قليلًا ثم إعادة المحاولة.",
  FILE_TOO_LARGE: "حجم الملف يتجاوز الحد المسموح.",
  FILE_TYPE_NOT_ALLOWED: "نوع الملف غير مسموح به.",
  FILE_TYPE_MISMATCH: "محتوى الملف لا يطابق نوعه أو امتداده.",
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "البيانات المرسلة غير صالحة.",
  401: CODE_MESSAGES.SESSION_EXPIRED,
  403: "لا تملك صلاحية القيام بهذا الإجراء.",
  404: "العنصر المطلوب غير موجود أو لم يعد متاحًا.",
  409: "تعذّر تنفيذ العملية بسبب تعارض مع بيانات موجودة.",
  413: CODE_MESSAGES.FILE_TOO_LARGE,
  429: CODE_MESSAGES.TOO_MANY_REQUESTS,
}

const ARABIC = /[؀-ۿ]/

/** Builds an ApiError from a failed response body (JSON or not). */
export function toApiError(status: number, body: unknown): ApiError {
  const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const code = typeof record.code === "string" ? record.code : `HTTP_${status}`
  const raw = record.message
  const details = Array.isArray(raw) ? raw.filter((m): m is string => typeof m === "string") : []
  const serverMessage = typeof raw === "string" ? raw : undefined
  const arabicDetail = details.find((d) => ARABIC.test(d))
  const message =
    CODE_MESSAGES[code] && status !== 400
      ? (serverMessage && ARABIC.test(serverMessage) ? serverMessage : CODE_MESSAGES[code])
      : serverMessage && ARABIC.test(serverMessage)
        ? serverMessage
        : (arabicDetail ?? CODE_MESSAGES[code] ?? STATUS_MESSAGES[status] ?? "حدث خطأ غير متوقّع. يرجى إعادة المحاولة.")
  return new ApiError(status, code, message, details, body)
}

export const networkError = () => new ApiError(0, "NETWORK_ERROR", CODE_MESSAGES.NETWORK_ERROR)

/** A user-facing Arabic message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return "حدث خطأ غير متوقّع. يرجى إعادة المحاولة."
}
