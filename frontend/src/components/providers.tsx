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
          position={dir === "rtl" ? "bottom-left" : "bottom-right"}
          richColors
        />
      </TooltipProvider>
    </DirectionProvider>
  )
}
