import {
  BookOpenCheck,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  Globe,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Settings,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Modules not built yet are listed (so the roadmap is visible) but disabled. */
  ready: boolean
  /** Match only the exact path (used for the dashboard root). */
  exact?: boolean
}

export interface NavSection {
  label?: string
  items: NavItem[]
}

export const adminNav: NavSection[] = [
  {
    items: [
      { label: "لوحة القيادة", href: "/admin", icon: LayoutDashboard, ready: true, exact: true },
    ],
  },
  {
    label: "التسيير البيداغوجي",
    items: [
      { label: "الطلبة", href: "/admin/students", icon: GraduationCap, ready: true },
      { label: "المعلمون", href: "/admin/teachers", icon: UsersRound, ready: true },
      { label: "المجموعات", href: "/admin/groups", icon: Users, ready: true },
      { label: "الفروع والقاعات", href: "/admin/branches", icon: Building2, ready: true },
      { label: "الرزنامة", href: "/admin/calendar", icon: CalendarDays, ready: true },
      { label: "الحصص", href: "/admin/sessions", icon: CalendarCheck2, ready: true },
      { label: "الحضور", href: "/admin/attendance", icon: ClipboardCheck, ready: true },
      { label: "متابعة الحفظ", href: "/admin/progress", icon: BookOpenCheck, ready: false },
    ],
  },
  {
    label: "التسجيل والمالية",
    items: [
      { label: "المدفوعات", href: "/admin/payments", icon: Wallet, ready: false },
      { label: "مطالب التسجيل", href: "/admin/pre-registrations", icon: ClipboardList, ready: false },
    ],
  },
  {
    label: "التواصل",
    items: [
      { label: "الموارد", href: "/admin/resources", icon: FolderOpen, ready: false },
      { label: "الإعلانات", href: "/admin/announcements", icon: Megaphone, ready: false },
      { label: "الموقع الإلكتروني", href: "/admin/website", icon: Globe, ready: false },
    ],
  },
]

export const adminFooterNav: NavItem[] = [
  { label: "الإعدادات", href: "/admin/settings", icon: Settings, ready: false },
]

export function isNavItemActive(item: NavItem, pathname: string) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function findActiveNavItem(pathname: string) {
  const all = [...adminNav.flatMap((s) => s.items), ...adminFooterNav]
  return all.find((item) => isNavItemActive(item, pathname))
}
