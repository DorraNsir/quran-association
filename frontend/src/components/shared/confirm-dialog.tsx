"use client"

import { Loader2 } from "lucide-react"
import { useRef, useState } from "react"

import { FormErrorAlert } from "@/components/shared/form-error-alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { errorMessage } from "@/lib/api/errors"
import { labels } from "@/lib/i18n"

/**
 * Confirmation of a sensitive action. When onConfirm returns a promise (an
 * API call) the dialog stays open with a pending button until it settles;
 * a failure is shown inside the dialog (the caller closes it on success).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = labels.common.cancel,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  /** The dismiss button («إلغاء» by default) */
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<unknown>
  /** Optional extra input (e.g. a reason) between the description and the buttons */
  children?: React.ReactNode
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous guard: `pending` only disables the button after a re-render, so
  // a second click in the same frame would run the action twice
  const running = useRef(false)

  function confirm(event: React.MouseEvent) {
    if (running.current) {
      event.preventDefault()
      return
    }
    const result = onConfirm()
    if (!result || typeof (result as Promise<unknown>).then !== "function") return
    event.preventDefault()
    running.current = true
    setPending(true)
    setError(null)
    ;(result as Promise<unknown>)
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => {
        running.current = false
        setPending(false)
      })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending || running.current) return
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <FormErrorAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? "destructive" : "default"} onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
