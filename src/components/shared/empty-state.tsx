import { Clock3, type LucideIcon } from "lucide-react"

import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

/** Placeholder for modules planned in later phases — honest, not fake data. */
export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <p className="flex items-center justify-center gap-2 font-medium text-foreground">
          {title}
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
            <Clock3 className="size-3" aria-hidden />
            {labels.common.comingSoon}
          </span>
        </p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
