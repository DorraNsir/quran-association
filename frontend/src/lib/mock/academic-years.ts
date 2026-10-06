import type { AcademicYear } from "@/types/domain"

/**
 * School years (two semesters each). A full academic-year administration
 * module comes later; this is just enough for memorization and period filters.
 */
export const academicYears: AcademicYear[] = [
  {
    id: "2025-2026",
    label: "2025–2026",
    startDate: "2025-09-15",
    endDate: "2026-06-30",
    isCurrent: false,
    semesters: {
      SEMESTER_1: { startDate: "2025-09-15", endDate: "2026-01-31" },
      SEMESTER_2: { startDate: "2026-02-01", endDate: "2026-06-30" },
    },
  },
  {
    id: "2026-2027",
    label: "2026–2027",
    startDate: "2026-09-14",
    endDate: "2027-06-30",
    isCurrent: true,
    semesters: {
      SEMESTER_1: { startDate: "2026-09-14", endDate: "2027-01-31" },
      SEMESTER_2: { startDate: "2027-02-01", endDate: "2027-06-30" },
    },
  },
]

export const CURRENT_ACADEMIC_YEAR = academicYears.find((y) => y.isCurrent) ?? academicYears[academicYears.length - 1]
