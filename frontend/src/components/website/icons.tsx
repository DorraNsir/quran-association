import {
  Award,
  BookOpen,
  CalendarCheck2,
  GraduationCap,
  HeartHandshake,
  Mic,
  Repeat,
  Smile,
  Sparkles,
  Star,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react"

/** Icons the CMS can pick for offerings and programs (stored as a key). */
export const WEBSITE_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  book: { icon: BookOpen, label: "مصحف" },
  repeat: { icon: Repeat, label: "مراجعة" },
  mic: { icon: Mic, label: "تلاوة" },
  heart: { icon: HeartHandshake, label: "متابعة" },
  teacher: { icon: GraduationCap, label: "معلم" },
  sparkles: { icon: Sparkles, label: "أنشطة" },
  calendar: { icon: CalendarCheck2, label: "حصص" },
  child: { icon: Smile, label: "أطفال" },
  users: { icon: Users, label: "مجموعة" },
  sun: { icon: Sun, label: "صيف" },
  award: { icon: Award, label: "تكريم" },
  star: { icon: Star, label: "نجمة" },
}

/** Renders a CMS icon key (falls back to the mushaf icon). */
export function WebsiteIcon({ name, className }: { name?: string; className?: string }) {
  const entry = (name && WEBSITE_ICONS[name]) || WEBSITE_ICONS.book
  const Icon = entry.icon
  return <Icon className={className} aria-hidden />
}
