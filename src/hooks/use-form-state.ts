"use client"

import { useState } from "react"

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

  function handleSubmit(onValid: (values: T) => void) {
    return (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setSubmitted(true)
      if (isValid) {
        onValid(values)
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

  return { values, setField, touch, errors, field, inputProps, handleSubmit, submitted, isValid }
}
