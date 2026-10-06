import type { User } from "@/types/domain"

/**
 * Mock accounts. One account can hold several roles: أحمد is an admin who
 * also teaches, so he switches between the two workspaces without logging
 * out. حمدي and درة are teachers only; مريم and مرام are students
 * (accounts linked to existing Student records, in two classes of مجموعة ماهر).
 */
export const users: User[] = [
  {
    id: "u1",
    firstName: "أحمد",
    lastName: "بن صالح",
    email: "ahmed.bensalah@omar-khattab.tn",
    phone: "98412305",
    roles: ["ADMIN", "TEACHER"],
    teacherId: "t1",
  },
  {
    id: "u2",
    firstName: "حمدي",
    lastName: "بن عثمان",
    email: "hamdi.benothman@omar-khattab.tn",
    phone: "26418593",
    roles: ["TEACHER"],
    teacherId: "t12",
  },
  {
    id: "u3",
    firstName: "درة",
    lastName: "بن سالم",
    email: "dorra.bensalem@omar-khattab.tn",
    phone: "53962140",
    roles: ["TEACHER"],
    teacherId: "t13",
  },
  {
    id: "u4",
    firstName: "مريم",
    lastName: "بوزيد",
    email: "meryem.bouzid@omar-khattab.tn",
    phone: "",
    roles: ["STUDENT"],
    studentId: "s53",
  },
  {
    id: "u5",
    firstName: "مرام",
    lastName: "العياشي",
    email: "maram.ayachi@omar-khattab.tn",
    phone: "",
    roles: ["STUDENT"],
    studentId: "s56",
  },
]

/** The account used when none is chosen. Change it here to demo another teacher by default. */
export const DEFAULT_USER_ID = "u1"

/** Display names of possible publishers — what content pages show instead of whole accounts. */
export const publisherNames: Record<string, string> = Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))
