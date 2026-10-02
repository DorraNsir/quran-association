"use client"

import { MoreHorizontal, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { Fragment } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface RowAction {
  label: string
  icon: LucideIcon
  href?: string
  onSelect?: () => void
  destructive?: boolean
  /** Draw a separator before this item */
  separated?: boolean
}

export function ActionsMenu({
  label,
  actions,
  triggerVariant = "ghost",
}: {
  label: string
  actions: RowAction[]
  triggerVariant?: "ghost" | "outline"
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={triggerVariant} size="icon" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Fragment key={action.label}>
              {action.separated && <DropdownMenuSeparator />}
              {action.href ? (
                <DropdownMenuItem asChild>
                  <Link href={action.href}>
                    <Icon />
                    {action.label}
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant={action.destructive ? "destructive" : "default"}
                  onSelect={action.onSelect}
                >
                  <Icon />
                  {action.label}
                </DropdownMenuItem>
              )}
            </Fragment>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
