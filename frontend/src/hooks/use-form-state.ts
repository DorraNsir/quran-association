"use client"

import { useRef, useState } from "react"

import { errorMessage } from "@/lib/api/errors"

type Errors<T> = Partial<Record<keyof T, string>>

/**
 * Minimal controlled-form state with derived validation.
 * Errors show after a field is blurred or after the first submit attempt.
 * Parents remount the form (via `key`) to load another record.
 */
export function useFormState<T extends object>(
  idPrefix: string,
  initial: T,
  validate: (values: T) => Errors<T>
) {
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  // Server round-trip: pending flag (no double submit) and the API's Arabic error
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const errors = validate(values)
  const isValid = Object.values(errors).every((e) => !e)

  const fieldId = (key: keyof T) => `${idPrefix}-${String(key)}`

  function setField<K extends keyof T>(key: K, value: T[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function touch(key: keyof T) {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
  }

  function errorFor(key: keyof T) {
    return submitted || touched[key] ? errors[key] : undefined
  }

  /** Props for FormField */
  function field(key: keyof T) {
    return { id: fieldId(key), error: errorFor(key) }
  }

  /** Props for a native text-like input bound to a string field */
  function inputProps(key: { [K in keyof T]: T[K] extends string ? K : never }[keyof T]) {
    const error = errorFor(key)
    return {
      id: fieldId(key),
      name: String(key),
      value: values[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setField(key, e.target.value as T[typeof key]),
      onBlur: () => touch(key),
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${fieldId(key)}-error` : undefined,
    }
  }

  /**
   * Validates, then calls onValid. When it returns a promise (an API call),
   * the form is pending until it settles and a failure is shown as
   * serverError — the backend stays the authority on validation.
   */
  function handleSubmit(onValid: (values: T) => void | Promise<unknown>) {
    return (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (inFlight.current) return
      setSubmitted(true)
      if (isValid) {
        const result = onValid(values)
        if (result && typeof (result as Promise<unknown>).then === "function") {
          inFlight.current = true
          setPending(true)
          setServerError(null)
          ;(result as Promise<unknown>)
            .catch((error: unknown) => setServerError(errorMessage(error)))
            .finally(() => {
              inFlight.current = false
              setPending(false)
            })
        }
        return
      }
      const firstInvalid = (Object.keys(errors) as (keyof T)[]).find((k) => errors[k])
      if (firstInvalid) {
        event.currentTarget
          .querySelector<HTMLElement>(`#${CSS.escape(fieldId(firstInvalid))}`)
          ?.focus()
      }
    }
  }

  return { values, setValues, setField, touch, errors, field, inputProps, handleSubmit, submitted, isValid, pending, serverError, setServerError }
}
