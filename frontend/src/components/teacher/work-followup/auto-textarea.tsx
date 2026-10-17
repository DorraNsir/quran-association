"use client"

import { useLayoutEffect, useRef } from "react"

import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * A Textarea that grows with its content — about two lines at first, up to
 * about seven, then scrolls inside. Measured in JS (no dependency) because
 * CSS `field-sizing: content` is not supported by every browser. Long
 * Arabic text, line breaks and unbroken strings all wrap; never wider than
 * its container.
 */
export function AutoTextarea({ className, value, ...props }: React.ComponentProps<typeof Textarea> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Re-measure on every value change (typing, paste, an existing description on open)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`
  }, [value])

  return (
    <Textarea
      ref={ref}
      value={value}
      rows={2}
      className={cn(
        // Fixed sizing: the height above is the only source of truth
        "min-h-[4.25rem] max-h-[11.5rem] resize-none overflow-y-auto field-sizing-fixed whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
        className
      )}
      {...props}
    />
  )
}
