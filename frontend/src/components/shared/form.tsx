"use client"

import { Camera, Loader2, Trash2 } from "lucide-react"
import { useRef } from "react"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { useDirection } from "@/components/ui/direction"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Side sheet hosting a create/edit form. Opens from the inline-end side,
 * has a scrollable body and a sticky action footer.
 */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitLabel = labels.common.save,
  pending = false,
  submitDisabled = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  submitLabel?: string
  pending?: boolean
  /** e.g. while a scheduling conflict is unresolved */
  submitDisabled?: boolean
  children: React.ReactNode
}) {
  const dir = useDirection()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={dir === "rtl" ? "left" : "right"}
        // side-specific variants are needed to override the sheet's default 3/4 width
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-xl data-[side=right]:sm:max-w-xl"
      >
        <form onSubmit={onSubmit} noValidate className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">{children}</div>
          <SheetFooter className="flex-row justify-end gap-2 border-t bg-muted/30 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" disabled={pending || submitDisabled} className="min-w-24">
              {pending && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>
    </section>
  )
}

export function FormField({
  id,
  label,
  required,
  optional,
  description,
  error,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  optional?: boolean
  description?: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Field data-invalid={error ? true : undefined} className={cn("gap-1.5", className)}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
        {optional && (
          <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
        )}
      </FieldLabel>
      {children}
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : (
        description && <FieldDescription className="text-xs">{description}</FieldDescription>
      )}
    </Field>
  )
}

/** Photo picker with live preview. Mock phase: the file stays in the browser. */
export function PhotoInput({
  id,
  name,
  value,
  onChange,
}: {
  id: string
  name: string
  value?: string
  onChange: (url: string | undefined) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (value?.startsWith("blob:")) URL.revokeObjectURL(value)
    onChange(URL.createObjectURL(file))
  }

  return (
    <div className="flex items-center gap-4 sm:col-span-2">
      <UserAvatar name={name || "؟"} photoUrl={value} size="xl" />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Camera />
            {value ? "تغيير الصورة" : "إضافة صورة"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
              <Trash2 />
              حذف
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">صورة شمسية واضحة — JPG أو PNG.</p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          tabIndex={-1}
          aria-label="صورة شمسية"
          onChange={handleFile}
        />
      </div>
    </div>
  )
}
