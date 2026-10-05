import type { LucideIcon } from "lucide-react"
import Link from "next/link"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  href,
  className,
}: {
  label: string
  value: React.ReactNode
  icon: LucideIcon
  hint?: React.ReactNode
  href?: string
  className?: string
}) {
  const body = (
    <Card
      className={cn(
        "h-full flex-row items-start gap-4 p-4 sm:p-5",
        href && "transition-colors hover:border-primary/40 hover:bg-brand-soft/20",
        className
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  )
  return href ? (
    <Link href={href} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      {body}
    </Link>
  ) : (
    body
  )
}
