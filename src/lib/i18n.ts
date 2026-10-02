import type {
  Gender,
  RecordStatus,
  Role,
  TeachingRole,
  Weekday,
} from "@/types/domain"

/**
 * Locale configuration. Arabic (RTL) is the only active locale in this phase;
 * French (LTR) will be added by providing a second dictionary with the same
 * shape and switching `dir` / `lang` on <html>.
 */
export type Locale = "ar" | "fr"

export const locales: Record<
  Locale,
  { label: string; dir: "rtl" | "ltr"; intl: string; available: boolean }
> = {
  ar: { label: "العربية", dir: "rtl", intl: "ar-TN-u-nu-latn", available: true },
  fr: { label: "Français", dir: "ltr", intl: "fr-TN", available: false },
}

export const defaultLocale: Locale = "ar"

/** Shared domain vocabulary — keep enum labels in one place. */
export const labels = {
  status: {
    ACTIVE: "نشط",
    INACTIVE: "غير نشط",
    ARCHIVED: "مؤرشف",
  } satisfies Record<RecordStatus, string>,
  role: {
    ADMIN: "مسؤول إداري",
    TEACHER: "معلم",
    STUDENT: "طالب",
  } satisfies Record<Role, string>,
  teachingRole: {
    SUPERVISOR: "المعلم المشرف",
    ASSISTANT: "المعلم المساعد",
  } satisfies Record<TeachingRole, string>,
  gender: {
    MALE: "ذكر",
    FEMALE: "أنثى",
  } satisfies Record<Gender, string>,
  weekday: {
    MON: "الاثنين",
    TUE: "الثلاثاء",
    WED: "الأربعاء",
    THU: "الخميس",
    FRI: "الجمعة",
    SAT: "السبت",
    SUN: "الأحد",
  } satisfies Record<Weekday, string>,
  weekdayShort: {
    MON: "اثنين",
    TUE: "ثلاثاء",
    WED: "أربعاء",
    THU: "خميس",
    FRI: "جمعة",
    SAT: "سبت",
    SUN: "أحد",
  } satisfies Record<Weekday, string>,
  common: {
    all: "الكل",
    view: "عرض",
    edit: "تعديل",
    save: "حفظ",
    cancel: "إلغاء",
    search: "بحث",
    actions: "إجراءات",
    resetFilters: "مسح عوامل التصفية",
    comingSoon: "قريبًا",
    notProvided: "غير متوفر",
    mockNotice: "بيانات تجريبية — لم يتم الحفظ في قاعدة بيانات",
  },
}

/** Week order used in the association (Monday first, as in Tunisia). */
export const WEEK_ORDER: Weekday[] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
]
