"use client"

import { cn } from "@/lib/utils"

export interface Choice<T extends string> {
  value: T
  label: string
  description?: string
}

/** Accessible radio cards: a large tap target per option, stacked on phones. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  choices,
  className,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  choices: Choice<T>[]
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {choices.map((choice) => {
        const checked = choice.value === value
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(choice.value)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border p-3 text-start text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              checked ? "border-primary bg-brand-soft/40" : "hover:bg-muted"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                checked ? "border-primary" : "border-muted-foreground/40"
              )}
            >
              {checked && <span className="size-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{choice.label}</span>
              {choice.description && <span className="block text-xs text-muted-foreground">{choice.description}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
