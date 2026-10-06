import type { TeacherNote } from "@/types/domain"

/** Private teacher notes — each teacher only sees their own (see lib/teacher-access). */
export const teacherNotes: TeacherNote[] = [
  {
    id: "tn1",
    studentId: "s53",
    teacherId: "t12",
    groupClassId: "g11-a",
    date: "2026-09-27",
    content: "تحسّن واضح في مخارج الحروف. تحتاج إلى مراجعة سورة النبأ قبل الانتقال.",
    createdAt: "2026-09-27",
    updatedAt: "2026-09-27",
  },
  {
    id: "tn2",
    studentId: "s55",
    teacherId: "t12",
    groupClassId: "g11-a",
    date: "2026-09-20",
    content: "يتأخر عن بداية الحصة. التواصل مع الولي لضبط موعد الوصول.",
    createdAt: "2026-09-20",
    updatedAt: "2026-09-20",
  },
  {
    id: "tn3",
    studentId: "s56",
    teacherId: "t13",
    groupClassId: "g11-b",
    date: "2026-09-27",
    content: "حفظ متقن وتلاوة هادئة. يمكن تكليفها بمساعدة زميلاتها في المراجعة.",
    createdAt: "2026-09-27",
    updatedAt: "2026-09-27",
  },
  {
    id: "tn4",
    studentId: "s1",
    teacherId: "t1",
    groupClassId: "g1-a",
    date: "2026-09-30",
    content: "مستوى ممتاز في التجويد. مرشح للمسابقة الجهوية.",
    createdAt: "2026-09-30",
    updatedAt: "2026-09-30",
  },
]
