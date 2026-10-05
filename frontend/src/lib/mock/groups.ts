import type { Group, GroupClass } from "@/types/domain"

export const groups: Group[] = [
  {
    id: "g1",
    name: "مجموعة الفرقان",
    audience: "يافعون 13–17 سنة",
    status: "ACTIVE",
    createdAt: "2023-09-10",
  },
  {
    id: "g2",
    name: "مجموعة النور",
    audience: "أطفال 7–10 سنوات",
    status: "ACTIVE",
    createdAt: "2023-09-10",
  },
  {
    id: "g3",
    name: "مجموعة الإيمان",
    audience: "كهول (رجال)",
    status: "ACTIVE",
    createdAt: "2022-10-03",
  },
  {
    id: "g4",
    name: "مجموعة الفجر",
    audience: "أطفال 5–7 سنوات",
    status: "ACTIVE",
    createdAt: "2024-09-14",
  },
  {
    id: "g5",
    name: "مجموعة الهدى",
    audience: "نساء",
    status: "ACTIVE",
    createdAt: "2021-10-11",
  },
  {
    id: "g6",
    name: "مجموعة الرحمة",
    audience: "أطفال 10–13 سنة",
    status: "ACTIVE",
    createdAt: "2022-09-17",
  },
  {
    id: "g7",
    name: "مجموعة البيان",
    audience: "يافعات 13–17 سنة",
    status: "ACTIVE",
    createdAt: "2024-09-21",
  },
  {
    id: "g8",
    name: "مجموعة التقوى",
    audience: "حفظ متقدم — شباب",
    status: "ACTIVE",
    createdAt: "2025-09-13",
  },
  {
    id: "g9",
    name: "مجموعة السلام",
    audience: "أطفال 7–10 سنوات",
    status: "ACTIVE",
    createdAt: "2025-09-13",
  },
  {
    id: "g10",
    name: "مجموعة اقرأ",
    audience: "أطفال 5–7 سنوات",
    status: "INACTIVE",
    createdAt: "2023-02-04",
  },
  {
    id: "g11",
    name: "مجموعة ماهر",
    audience: "أطفال 8–11 سنة",
    status: "ACTIVE",
    createdAt: "2026-09-12",
  },
]

/**
 * Actual classes ("حلقات"). Most groups run a single class; مجموعة ماهر
 * runs two independent classes in two branches with two supervisors:
 * same pedagogical group, different students, schedule and attendance.
 */
export const groupClasses: GroupClass[] = [
  { id: "g1-a", groupId: "g1", branchId: "b1", roomId: "b1-r1", supervisorId: "t1", assistantIds: ["t2", "t3"], status: "ACTIVE" },
  { id: "g2-a", groupId: "g2", branchId: "b1", roomId: "b1-r2", supervisorId: "t4", assistantIds: ["t3"], status: "ACTIVE" },
  { id: "g3-a", groupId: "g3", branchId: "b1", roomId: "b1-r3", supervisorId: "t5", assistantIds: [], status: "ACTIVE" },
  { id: "g4-a", groupId: "g4", branchId: "b2", roomId: "b2-r1", supervisorId: "t6", assistantIds: ["t8"], status: "ACTIVE" },
  { id: "g5-a", groupId: "g5", branchId: "b2", roomId: "b2-r2", supervisorId: "t3", assistantIds: ["t6"], status: "ACTIVE" },
  { id: "g6-a", groupId: "g6", branchId: "b3", roomId: "b3-r1", supervisorId: "t9", assistantIds: ["t7", "t11"], status: "ACTIVE" },
  { id: "g7-a", groupId: "g7", branchId: "b3", roomId: "b3-r2", supervisorId: "t8", assistantIds: ["t4"], status: "ACTIVE" },
  { id: "g8-a", groupId: "g8", branchId: "b1", roomId: "b1-r4", supervisorId: "t1", assistantIds: ["t5"], status: "ACTIVE" },
  { id: "g9-a", groupId: "g9", branchId: "b3", roomId: "b3-r3", supervisorId: "t7", assistantIds: [], status: "ACTIVE" },
  { id: "g10-a", groupId: "g10", branchId: "b4", roomId: "b4-r1", supervisorId: "t10", assistantIds: [], status: "INACTIVE" },
  { id: "g11-a", groupId: "g11", branchId: "b1", roomId: "b1-r3", supervisorId: "t12", assistantIds: [], status: "ACTIVE" },
  { id: "g11-b", groupId: "g11", branchId: "b2", roomId: "b2-r1", supervisorId: "t13", assistantIds: [], status: "ACTIVE" },
]
