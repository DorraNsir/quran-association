import {
  BookOpen,
  BookOpenCheck,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CircleUserRound,
  FolderOpen,
  Globe,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  Settings,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import type { Workspace } from "@/lib/workspace"

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
      { label: "متابعة الحفظ", href: "/admin/memorization", icon: BookOpenCheck, ready: true },
    ],
  },
  {
    label: "التسجيل والمالية",
    items: [
      { label: "المدفوعات", href: "/admin/payments", icon: Wallet, ready: true },
      { label: "طلبات التسجيل", href: "/admin/registration-requests", icon: ClipboardList, ready: true },
    ],
  },
  {
    label: "التواصل",
    items: [
      { label: "الموارد", href: "/admin/resources", icon: FolderOpen, ready: true },
      { label: "الإعلانات", href: "/admin/announcements", icon: Megaphone, ready: true },
      { label: "الموقع الإلكتروني", href: "/admin/website", icon: Globe, ready: false },
    ],
  },
]

export const adminFooterNav: NavItem[] = [
  { label: "الإعدادات", href: "/admin/settings", icon: Settings, ready: false },
]

/** Teacher Space: only the teacher's own classes, students and sessions — no management. */
export const teacherNav: NavSection[] = [
  {
    items: [
      { label: "لوحة القيادة", href: "/teacher", icon: LayoutDashboard, ready: true, exact: true },
    ],
  },
  {
    label: "عملي اليومي",
    items: [
      { label: "مجموعاتي", href: "/teacher/classes", icon: BookOpen, ready: true },
      { label: "طلابي", href: "/teacher/students", icon: GraduationCap, ready: true },
      { label: "الحصص", href: "/teacher/sessions", icon: CalendarCheck2, ready: true },
      { label: "متابعة الحفظ", href: "/teacher/memorization", icon: BookOpenCheck, ready: true },
      { label: "ملاحظاتي", href: "/teacher/notes", icon: NotebookPen, ready: true },
      { label: "جدولي", href: "/teacher/schedule", icon: CalendarDays, ready: true },
    ],
  },
  {
    label: "التواصل",
    items: [
      { label: "الموارد", href: "/teacher/resources", icon: FolderOpen, ready: true },
      { label: "الإعلانات", href: "/teacher/announcements", icon: Megaphone, ready: true },
    ],
  },
]

/** Student Space: read-only, the student's own information only — no other students, no notes. */
export const studentNav: NavSection[] = [
  {
    items: [
      { label: "لوحة القيادة", href: "/student", icon: LayoutDashboard, ready: true, exact: true },
      { label: "مجموعتي", href: "/student/group", icon: BookOpen, ready: true },
      { label: "جدولي", href: "/student/schedule", icon: CalendarDays, ready: true },
      { label: "الحضور", href: "/student/attendance", icon: ClipboardCheck, ready: true },
      { label: "متابعة الحفظ", href: "/student/memorization", icon: BookOpenCheck, ready: true },
      { label: "الموارد", href: "/student/resources", icon: FolderOpen, ready: true },
      { label: "الإعلانات", href: "/student/announcements", icon: Megaphone, ready: true },
      { label: "المدفوعات", href: "/student/payments", icon: Wallet, ready: true },
      { label: "الملف الشخصي", href: "/student/profile", icon: CircleUserRound, ready: true },
    ],
  },
]

/** Navigation of each workspace (looked up client-side: icons can't cross the server boundary). */
export const workspaceNav: Record<Workspace, { label: string; sections: NavSection[]; footer: NavItem[] }> = {
  admin: { label: "فضاء الإدارة", sections: adminNav, footer: adminFooterNav },
  teacher: { label: "فضاء المعلم", sections: teacherNav, footer: [] },
  student: { label: "فضاء الطالب", sections: studentNav, footer: [] },
}

export function isNavItemActive(item: NavItem, pathname: string) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function findActiveNavItem(pathname: string, workspace: Workspace) {
  const { sections, footer } = workspaceNav[workspace]
  const all = [...sections.flatMap((s) => s.items), ...footer]
  return all.find((item) => isNavItemActive(item, pathname))
}
