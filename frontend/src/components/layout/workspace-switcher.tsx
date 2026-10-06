"use client"

import { Check, ChevronsUpDown, GraduationCap, School, ShieldCheck } from "lucide-react"
import Link from "next/link"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Workspace } from "@/lib/workspace"
import type { Role } from "@/types/domain"

export const workspaces = [
  { id: "admin" as Workspace, label: "فضاء الإدارة", href: "/admin", icon: ShieldCheck, role: "ADMIN" as Role },
  { id: "teacher" as Workspace, label: "فضاء المعلم", href: "/teacher", icon: School, role: "TEACHER" as Role },
  { id: "student" as Workspace, label: "فضاء الطالب", href: "/student", icon: GraduationCap, role: "STUDENT" as Role },
]

/**
 * A multi-role user switches workspace without logging out.
 * Only workspaces matching the user's roles are listed; with a single
 * workspace the current one is shown without a menu.
 */
export function WorkspaceSwitcher({ roles, current }: { roles: Role[]; current: Workspace }) {
  const available = workspaces.filter((w) => roles.includes(w.role))
  const active = workspaces.find((w) => w.id === current) ?? workspaces[0]
  const ActiveIcon = active.icon

  const body = (
    <>
      <span className="flex size-7 items-center justify-center rounded-md bg-brand-soft text-brand-soft-foreground">
        <ActiveIcon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-xs text-muted-foreground">مساحة العمل</span>
        <span className="truncate font-medium">{active.label}</span>
      </span>
    </>
  )
  const box = "flex w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-start text-sm"

  if (available.length < 2) return <div className={box}>{body}</div>

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`${box} outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50`}>
        {body}
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>تبديل مساحة العمل</DropdownMenuLabel>
        {available.map((workspace) => {
          const Icon = workspace.icon
          return (
            <DropdownMenuItem key={workspace.id} asChild>
              <Link href={workspace.href} aria-current={workspace.id === current ? "page" : undefined}>
                <Icon aria-hidden />
                <span className="flex-1">{workspace.label}</span>
                {workspace.id === current && <Check className="text-primary" aria-label="المساحة الحالية" />}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
