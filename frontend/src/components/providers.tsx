"use client"

import { QueryClientProvider } from "@tanstack/react-query"

import { DirectionProvider } from "@/components/ui/direction"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getQueryClient } from "@/lib/api/query-client"
import { AuthProvider } from "@/lib/auth/auth-provider"

export function Providers({
  dir,
  children,
}: {
  dir: "rtl" | "ltr"
  children: React.ReactNode
}) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <AuthProvider>
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
      </AuthProvider>
    </QueryClientProvider>
  )
}
