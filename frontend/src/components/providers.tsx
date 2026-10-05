"use client"

import { DirectionProvider } from "@/components/ui/direction"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

export function Providers({
  dir,
  children,
}: {
  dir: "rtl" | "ltr"
  children: React.ReactNode
}) {
  return (
    <DirectionProvider dir={dir}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster
          theme="light"
          dir={dir}
          // Top: bottom corners are taken by sticky action bars (e.g. "save attendance")
          position="top-center"
          richColors
        />
      </TooltipProvider>
    </DirectionProvider>
  )
}
