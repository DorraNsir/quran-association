import type { Branch, Room } from "@/types/domain"

export const branches: Branch[] = [
  {
    id: "b1",
    name: "المقر الرئيسي — دار شعبان الفهري",
    address: "نهج الجامع الكبير، دار شعبان الفهري 8011، نابل",
    phone: "72290415",
    status: "ACTIVE",
  },
  {
    id: "b2",
    name: "فرع حي الرياض",
    address: "نهج ابن خلدون، حي الرياض، دار شعبان الفهري",
    phone: "72291832",
    status: "ACTIVE",
  },
  {
    id: "b3",
    name: "فرع الفهري",
    address: "شارع الحبيب بورقيبة، الفهري 8011",
    status: "ACTIVE",
  },
  {
    id: "b4",
    name: "فرع حي النسيم",
    address: "نهج الياسمين، حي النسيم، دار شعبان الفهري",
    status: "INACTIVE",
  },
]

function room(branchId: string, n: number, status: Room["status"] = "ACTIVE"): Room {
  return { id: `${branchId}-r${n}`, branchId, name: `القاعة ${n}`, status }
}

/** Rooms reference their branch by id. */
export const rooms: Room[] = [
  room("b1", 1),
  room("b1", 2),
  room("b1", 3),
  room("b1", 4),
  room("b1", 5, "INACTIVE"), // أشغال صيانة
  room("b2", 1),
  room("b2", 2),
  room("b3", 1),
  room("b3", 2),
  room("b3", 3),
  room("b4", 1),
  room("b4", 2),
]
