import type { ZodError } from 'zod'

/** Turn Zod flatten() / issue list into a short Hebrew message for toasts. */
export function formatZodError(error: ZodError | { formErrors: string[]; fieldErrors: Record<string, string[]> }): string {
  if ('issues' in error && Array.isArray(error.issues)) {
    const first = error.issues[0]
    if (first?.message) return first.message
  }

  const flat =
    'formErrors' in error
      ? error
      : (error as ZodError).flatten?.() ?? { formErrors: [], fieldErrors: {} }

  if (Array.isArray(flat.formErrors) && flat.formErrors.length > 0) return flat.formErrors[0]

  const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>
  for (const messages of Object.values(fieldErrors)) {
    if (messages?.length) return messages[0]
  }

  return 'נתונים לא תקינים — בדקו את השדות'
}

export function formatApiErrorBody(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    if ('issues' in error || 'formErrors' in error) {
      return formatZodError(error as ZodError)
    }
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message
    }
  }
  return 'שגיאה — נסו שוב'
}
