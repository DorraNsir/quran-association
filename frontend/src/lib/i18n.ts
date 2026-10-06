import type {
  AnnouncementAudienceType,
  BillingType,
  PaymentMethod,
  RegistrationRequestSource,
  RegistrationRequestStatus,
  AttendanceStatus,
  Semester,
  ConflictType,
  Gender,
  RecordStatus,
  ResourceType,
  ResourceVisibilityType,
  Role,
  SessionStatus,
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
  /** French (later): ROOM "Cette salle est déjà occupée pendant cette période." /
   *  TEACHER "Cet enseignant est déjà affecté à un autre groupe pendant cette période." */
  conflict: {
    ROOM: { title: "تعارض في القاعة", message: "هذه القاعة مستخدمة خلال هذا الوقت." },
    TEACHER: {
      title: "تعارض في المعلم",
      message: "هذا المعلم مرتبط بمجموعة أخرى خلال هذا الوقت.",
    },
    CLASS: { title: "تداخل في حصص الحلقة", message: "للحلقة حصة أخرى خلال هذا الوقت." },
  } satisfies Record<ConflictType, { title: string; message: string }>,
  attendance: {
    PRESENT: "حاضر",
    ABSENT: "غائب",
    EXCUSED: "غياب مبرر",
    LATE: "متأخر",
  } satisfies Record<AttendanceStatus, string>,
  sessionStatus: {
    SCHEDULED: "مبرمجة",
    COMPLETED: "منجزة",
    CANCELLED: "ملغاة",
  } satisfies Record<SessionStatus, string>,
  semester: {
    SEMESTER_1: "السداسي الأول",
    SEMESTER_2: "السداسي الثاني",
  } satisfies Record<Semester, string>,
  /** A GroupClass, as users call it: one actual class of a pedagogical group */
  groupClass: { one: "حلقة", plural: "الحلقات" },
  resourceType: {
    PDF: "ملف PDF",
    IMAGE: "صورة",
    AUDIO: "ملف صوتي",
    VIDEO_LINK: "رابط فيديو",
    EXTERNAL_LINK: "رابط خارجي",
    FILE: "ملف",
  } satisfies Record<ResourceType, string>,
  resourceVisibility: {
    ALL_STUDENTS: "جميع الطلاب",
    GROUP: "مجموعة محددة",
    GROUP_CLASS: "فصل محدد",
  } satisfies Record<ResourceVisibilityType, string>,
  announcementAudience: {
    EVERYONE: "الجميع",
    TEACHERS: "المعلمون",
    STUDENTS: "الطلاب",
    SPECIFIC_GROUP_CLASSES: "فصول محددة",
  } satisfies Record<AnnouncementAudienceType, string>,
  registrationSource: {
    PUBLIC_WEBSITE: "الموقع الإلكتروني",
    ADMIN: "الإدارة",
  } satisfies Record<RegistrationRequestSource, string>,
  registrationStatus: {
    PENDING: "قيد الانتظار",
    ACCEPTED: "مقبول",
    REFUSED: "مرفوض",
  } satisfies Record<RegistrationRequestStatus, string>,
  billingType: {
    YEARLY: "سنوي",
    MONTHLY: "شهري",
  } satisfies Record<BillingType, string>,
  paymentMethod: {
    CASH: "نقداً",
  } satisfies Record<PaymentMethod, string>,
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
