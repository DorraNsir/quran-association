"use client"

import { Check, ChevronsUpDown, School, ShieldCheck } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { labels } from "@/lib/i18n"
import type { Role } from "@/types/domain"

const workspaces = [
  { id: "admin", label: "فضاء الإدارة", icon: ShieldCheck, role: "ADMIN" as Role, ready: true },
  { id: "teacher", label: "فضاء المعلم", icon: School, role: "TEACHER" as Role, ready: false },
]

/**
 * A multi-role user switches workspace without logging out.
 * Only workspaces matching the user's roles are listed.
 */
export function WorkspaceSwitcher({ roles }: { roles: Role[] }) {
  const available = workspaces.filter((w) => roles.includes(w.role))
  const current = workspaces[0]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-start text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex size-7 items-center justify-center rounded-md bg-brand-soft text-brand-soft-foreground">
          <CurrentIcon className="size-4" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-xs text-muted-foreground">مساحة العمل</span>
          <span className="truncate font-medium">{current.label}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>تبديل مساحة العمل</DropdownMenuLabel>
        {available.map((workspace) => {
          const Icon = workspace.icon
          return (
            <DropdownMenuItem key={workspace.id} disabled={!workspace.ready}>
              <Icon aria-hidden />
              <span className="flex-1">{workspace.label}</span>
              {workspace.id === current.id ? (
                <Check className="text-primary" aria-label="المساحة الحالية" />
              ) : (
                !workspace.ready && (
                  <span className="text-xs text-muted-foreground">
                    {labels.common.comingSoon}
                  </span>
                )
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
