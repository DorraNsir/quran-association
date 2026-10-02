"use client"

import { Bell, Check, Languages, LogOut, Menu, School, UserRound } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import { useDirection } from "@/components/ui/direction"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { fullName } from "@/lib/domain"
import { defaultLocale, labels, locales, type Locale } from "@/lib/i18n"
import type { User } from "@/types/domain"

import { Brand } from "./brand"
import { findActiveNavItem } from "./nav-config"
import { SidebarNav } from "./sidebar-nav"
import { WorkspaceSwitcher } from "./workspace-switcher"

function MobileNav({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const dir = useDirection()

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="فتح القائمة"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={dir === "rtl" ? "right" : "left"}
          className="gap-0 p-0 data-[side=left]:w-72 data-[side=right]:w-72"
        >
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
            <SheetDescription className="sr-only">التنقل بين وحدات المنصة</SheetDescription>
            <Brand />
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
            <WorkspaceSwitcher roles={user.roles} />
            <SidebarNav onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function LanguageSwitcher() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="اللغة">
          <Languages className="size-[1.1rem]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>لغة الواجهة</DropdownMenuLabel>
        {(Object.keys(locales) as Locale[]).map((code) => {
          const locale = locales[code]
          return (
            <DropdownMenuItem key={code} disabled={!locale.available} lang={code}>
              <span className="flex-1">{locale.label}</span>
              {code === defaultLocale ? (
                <Check className="text-primary" aria-label="اللغة الحالية" />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {labels.common.comingSoon}
                </span>
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationsButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="الإشعارات">
          <Bell className="size-[1.1rem]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Bell className="size-4" aria-hidden />
          </span>
          <p className="text-sm font-medium">لا توجد إشعارات</p>
          <p className="text-xs text-muted-foreground">
            ستتوفر الإشعارات مع وحدة الإعلانات في مرحلة قادمة.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function UserMenu({ user }: { user: User }) {
  const name = fullName(user)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg p-1 text-start outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:pe-2.5">
        <UserAvatar name={name} photoUrl={user.photoUrl} size="sm" />
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">
            {user.roles.map((r) => labels.role[r]).join(" · ")}
          </span>
        </span>
        <span className="sr-only">قائمة المستخدم</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground" dir="ltr">
            {user.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>
            <UserRound />
            <span className="flex-1">ملفي الشخصي</span>
            <span className="text-xs text-muted-foreground">{labels.common.comingSoon}</span>
          </DropdownMenuItem>
          {user.roles.includes("TEACHER") && (
            <DropdownMenuItem disabled>
              <School />
              <span className="flex-1">الانتقال إلى فضاء المعلم</span>
              <span className="text-xs text-muted-foreground">{labels.common.comingSoon}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => toast.info("تسجيل الدخول والخروج سيُفعَّلان مع ربط الخادم.")}
        >
          <LogOut />
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AdminHeader({ user }: { user: User }) {
  const pathname = usePathname()
  const section = findActiveNavItem(pathname)
  const SectionIcon = section?.icon

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-6 lg:px-8">
      <MobileNav user={user} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {SectionIcon && (
          <SectionIcon className="hidden size-4 text-primary sm:block" aria-hidden />
        )}
        <p className="truncate text-sm font-medium">
          <span className="hidden text-muted-foreground sm:inline">فضاء الإدارة / </span>
          {section?.label ?? "فضاء الإدارة"}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <NotificationsButton />
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
