import type { LucideIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPhone } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export interface InfoItem {
  label: string
  value?: React.ReactNode
  icon?: LucideIcon
}

/** Label/value pairs as a semantic description list. */
export function InfoList({ items, className }: { items: InfoItem[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex min-w-0 gap-3">
          {Icon && (
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium break-words text-foreground">
              {value ?? (
                <span className="font-normal text-muted-foreground">
                  {labels.common.notProvided}
                </span>
              )}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  )
}

/** Titled card section used throughout profile pages. */
export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string
  icon?: LucideIcon
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-primary" aria-hidden />}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Phone numbers are always LTR, even inside Arabic text, and dialable on mobile. */
export function PhoneLink({ phone, className }: { phone?: string; className?: string }) {
  if (!phone) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <a
      href={`tel:+216${phone}`}
      dir="ltr"
      className={cn("tabular-nums hover:text-primary hover:underline", className)}
    >
      {formatPhone(phone)}
    </a>
  )
}
