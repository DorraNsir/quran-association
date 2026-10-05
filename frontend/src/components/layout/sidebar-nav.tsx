"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

import { labels } from "@/lib/i18n"

import {
  adminFooterNav,
  adminNav,
  isNavItemActive,
  type NavItem,
} from "./nav-config"

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const base =
    "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

  if (!item.ready) {
    return (
      <span
        aria-disabled="true"
        className={cn(base, "cursor-not-allowed text-muted-foreground/70")}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
          {labels.common.comingSoon}
        </span>
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-sidebar-primary"
        />
      )}
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
        aria-hidden
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav aria-label="القائمة الرئيسية" className="flex flex-1 flex-col gap-5">
      {adminNav.map((section, index) => (
        <div key={section.label ?? index} className="flex flex-col gap-0.5">
          {section.label && (
            <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">
              {section.label}
            </p>
          )}
          {section.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isNavItemActive(item, pathname)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-0.5 border-t pt-3">
        {adminFooterNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isNavItemActive(item, pathname)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  )
}
