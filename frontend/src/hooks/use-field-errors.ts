import { useCallback, useRef, useState } from 'react'

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>

/**
 * Tracks per-field error messages for a form and moves focus to the first
 * invalid field, in `fieldOrder`, whenever a new set of errors is shown.
 */
export function useFieldErrors<Field extends string>(
  fieldOrder: readonly Field[],
) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Field>>({})
  const inputs = useRef(new Map<Field, HTMLInputElement>())

  /** Callback ref that registers a field's input so it can receive focus. */
  const fieldRef = useCallback(
    (field: Field) => (input: HTMLInputElement | null) => {
      if (input) {
        inputs.current.set(field, input)
      } else {
        inputs.current.delete(field)
      }
    },
    [],
  )

  const showFieldErrors = useCallback(
    (errors: FieldErrors<Field>) => {
      setFieldErrors(errors)
      const firstInvalidField = fieldOrder.find((field) => errors[field])
      if (firstInvalidField) {
        inputs.current.get(firstInvalidField)?.focus()
      }
    },
    [fieldOrder],
  )

  const clearFieldError = useCallback((...fields: Field[]) => {
    setFieldErrors((current) => {
      if (!fields.some((field) => field in current)) {
        return current
      }
      const next = { ...current }
      for (const field of fields) {
        delete next[field]
      }
      return next
    })
  }, [])

  return { fieldErrors, fieldRef, showFieldErrors, clearFieldError }
}
