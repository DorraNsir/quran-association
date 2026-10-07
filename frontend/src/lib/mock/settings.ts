import type { AssociationSettings, PlatformSettings } from "@/types/domain"

/** Official identity (the bundled logo is used while logoUrl is empty). */
export const associationSettings: AssociationSettings = {
  name: "الفرع المحلي عمر بن الخطاب بدار شعبان الفهري",
  phone: "72290415",
  email: "contact@omar-khattab.tn",
  address: "نهج الجامع الكبير، دار شعبان الفهري 8011، نابل",
  updatedAt: "2026-09-01",
}

export const platformSettings: PlatformSettings = {
  timezone: "Africa/Tunis",
  dateFormat: "DD/MM/YYYY",
  defaultCalendarView: "week",
  defaultPageSize: 10,
  updatedAt: "2026-09-01",
}
