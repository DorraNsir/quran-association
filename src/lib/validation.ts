/** Shared field rules, with Arabic messages. */

/** Wrap LTR fragments (numbers with spaces) so they don't reorder inside Arabic text. */
export const ltr = (text: string) => `\u2066${text}\u2069`

export const PHONE_HINT = `8 أرقام، مثال: ${ltr("22 345 678")}`

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "")
}

/** Tunisian mobile/landline: 8 digits starting with 2, 3, 4, 5, 7 or 9. */
export function isValidPhone(value: string) {
  return /^[234579]\d{7}$/.test(normalizePhone(value))
}

export function isValidCin(value: string) {
  return /^\d{8}$/.test(value.trim())
}

export function requiredText(value: string, message: string) {
  return value.trim() ? undefined : message
}

export function phoneError(value: string, { required }: { required: boolean }) {
  if (!value.trim()) return required ? "رقم الهاتف مطلوب" : undefined
  return isValidPhone(value) ? undefined : "رقم هاتف غير صالح — " + PHONE_HINT
}
