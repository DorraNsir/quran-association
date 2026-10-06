"use client"

import { Bell, Check, FlaskConical, Languages, LogOut, Menu, UserRound } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { setMockAccount } from "@/lib/auth/mock-account"
import { fullName } from "@/lib/domain"
import { defaultLocale, labels, locales, type Locale } from "@/lib/i18n"
import { homeOf, type Workspace } from "@/lib/workspace"
import type { User } from "@/types/domain"

import { Brand } from "./brand"
import { findActiveNavItem, workspaceNav } from "./nav-config"
import { SidebarNav } from "./sidebar-nav"
import { workspaces, WorkspaceSwitcher } from "./workspace-switcher"

function MobileNav({ user, workspace }: { user: User; workspace: Workspace }) {
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
            <Brand href={`/${workspace}`} />
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
            <WorkspaceSwitcher roles={user.roles} current={workspace} />
            <SidebarNav workspace={workspace} onNavigate={() => setOpen(false)} />
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

function UserMenu({ user, accounts, workspace }: { user: User; accounts: User[]; workspace: Workspace }) {
  const router = useRouter()
  const name = fullName(user)
  // The other workspaces this account may open (one account, several roles)
  const others = workspaces.filter((w) => w.id !== workspace && user.roles.includes(w.role))

  function switchAccount(id: string) {
    const account = accounts.find((a) => a.id === id)
    if (!account || account.id === user.id) return
    setMockAccount(account.id)
    // Client-side navigation keeps the in-memory mock store across the switch
    router.push(homeOf(account))
    router.refresh()
    toast.success(`أنت الآن تتصفح بحساب ${fullName(account)}`)
  }

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
      <DropdownMenuContent align="end" className="w-64">
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
          {others.map((w) => {
            const Icon = w.icon
            return (
              <DropdownMenuItem key={w.id} asChild>
                <Link href={w.href}>
                  <Icon />
                  الانتقال إلى {w.label}
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* PROTOTYPE ONLY: replaces login until real authentication exists */}
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <FlaskConical className="size-3.5" aria-hidden />
          حساب تجريبي (للعرض فقط)
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={user.id} onValueChange={switchAccount}>
          {accounts.map((account) => (
            <DropdownMenuRadioItem key={account.id} value={account.id}>
              <span className="flex min-w-0 flex-col leading-tight">
                <span>{fullName(account)}</span>
                <span className="text-xs text-muted-foreground">{account.roles.map((r) => labels.role[r]).join(" · ")}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
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

export function AppHeader({ user, accounts, workspace }: { user: User; accounts: User[]; workspace: Workspace }) {
  const pathname = usePathname()
  const section = findActiveNavItem(pathname, workspace)
  const workspaceLabel = workspaceNav[workspace].label
  const SectionIcon = section?.icon

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-6 lg:px-8">
      <MobileNav user={user} workspace={workspace} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {SectionIcon && (
          <SectionIcon className="hidden size-4 text-primary sm:block" aria-hidden />
        )}
        <p className="truncate text-sm font-medium">
          <span className="hidden text-muted-foreground sm:inline">{workspaceLabel} / </span>
          {section?.label ?? workspaceLabel}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        <NotificationsButton />
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />
        <UserMenu user={user} accounts={accounts} workspace={workspace} />
      </div>
    </header>
  )
}
