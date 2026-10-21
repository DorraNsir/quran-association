import { AlertCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * A FORM-LEVEL error (failed save, 400 / 409 from the API, a business rule):
 * placed next to the form's action buttons — never at the top of a scrolling
 * body — so it is seen where the user just clicked. Field errors stay under
 * their own input (FormField). Long messages wrap and scroll inside the alert,
 * so the buttons below it stay in place.
 */
export function FormErrorAlert({
  message,
  title,
  children,
  className,
}: {
  message?: React.ReactNode
  title?: string
  /** Extra content below the message (e.g. a «reload» action) */
  children?: React.ReactNode
  className?: string
}) {
  if (!message && !children) return null
  return (
    <Alert variant="destructive" role="alert" aria-live="assertive" data-form-error="" className={className}>
      <AlertCircle aria-hidden />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription className="max-h-32 overflow-y-auto break-words whitespace-pre-line">
        {message}
        {children}
      </AlertDescription>
    </Alert>
  )
}
