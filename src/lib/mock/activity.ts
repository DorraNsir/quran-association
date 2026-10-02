import type { ActivityEntry } from "@/types/domain"

export const recentActivity: ActivityEntry[] = [
  {
    id: "a1",
    kind: "STUDENT_REGISTERED",
    message: "تسجيل الطالب طه بن عيسى في مجموعة الفجر",
    actor: "أحمد بن صالح",
    at: "2026-09-27T10:15:00+01:00",
  },
  {
    id: "a2",
    kind: "TEACHER_ASSIGNED",
    message: "تعيين سفيان بن علي معلمًا مساعدًا في مجموعة الرحمة",
    actor: "أحمد بن صالح",
    at: "2026-09-26T18:40:00+01:00",
  },
  {
    id: "a3",
    kind: "GROUP_SCHEDULE_CHANGED",
    message: "تعديل توقيت حصة الجمعة لمجموعة التقوى إلى 17:30",
    actor: "أحمد بن صالح",
    at: "2026-09-24T09:05:00+01:00",
  },
  {
    id: "a4",
    kind: "STUDENT_TRANSFERRED",
    message: "نقل الطالبة أميرة الحناشي من مجموعة النور إلى مجموعة البيان",
    actor: "أحمد بن صالح",
    at: "2026-09-21T16:20:00+01:00",
  },
  {
    id: "a5",
    kind: "STUDENT_ARCHIVED",
    message: "أرشفة ملف الطالب أنس الحناشي بطلب من وليّه",
    actor: "أحمد بن صالح",
    at: "2026-09-18T11:00:00+01:00",
  },
  {
    id: "a6",
    kind: "GROUP_STATUS_CHANGED",
    message: "إيقاف مجموعة اقرأ مؤقتًا بسبب أشغال صيانة في فرع حي النسيم",
    actor: "أحمد بن صالح",
    at: "2026-09-10T08:30:00+01:00",
  },
]
