import type { Branch, Room } from "@/types/domain"

function rooms(branchId: string, count: number): Room[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${branchId}-r${i + 1}`,
    branchId,
    name: `القاعة ${i + 1}`,
  }))
}

export const branches: Branch[] = [
  {
    id: "b1",
    name: "المقر الرئيسي — دار شعبان الفهري",
    address: "نهج الجامع الكبير، دار شعبان الفهري 8011، نابل",
    status: "ACTIVE",
    rooms: rooms("b1", 4),
  },
  {
    id: "b2",
    name: "فرع حي الرياض",
    address: "نهج ابن خلدون، حي الرياض، دار شعبان الفهري",
    status: "ACTIVE",
    rooms: rooms("b2", 2),
  },
  {
    id: "b3",
    name: "فرع الفهري",
    address: "شارع الحبيب بورقيبة، الفهري 8011",
    status: "ACTIVE",
    rooms: rooms("b3", 3),
  },
  {
    id: "b4",
    name: "فرع حي النسيم",
    address: "نهج الياسمين، حي النسيم، دار شعبان الفهري",
    status: "INACTIVE",
    rooms: rooms("b4", 2),
  },
]
