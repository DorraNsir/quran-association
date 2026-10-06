"use client"

import { BookMarked } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { SurahCombobox } from "@/components/quran/surah-combobox"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { fullName, indexLookups, studentClass, type Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import { defaultUpdater, getMemorizationProgress } from "@/lib/memorization"
import { surahLabel } from "@/lib/quran/surahs"
import { operations, useOperations } from "@/lib/store/operations"
import type { AcademicYear, ID, ISODate, Semester, Student, SurahNumber } from "@/types/domain"

/** Last memorized surah, or a concise "not set" state. */
export function MemorizationValue({ surah, className }: { surah?: SurahNumber; className?: string }) {
  return surah ? (
    <span className={className}>
      <span className="font-medium">{surahLabel(surah)}</span>
    </span>
  ) : (
    <span className={`text-muted-foreground ${className ?? ""}`}>لم يتم تحديدها بعد</span>
  )
}

/**
 * The single form for setting a student's last memorized surah for one
 * semester. Everything else (student, group, supervisor, period) is known
 * and only shown. Used by the admin overview, the student profile and the
 * group page — and by the Teacher Space later.
 */
export function MemorizationDialog({
  open,
  onOpenChange,
  student,
  academicYear,
  semester,
  current,
  lookups,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: Student
  academicYear: AcademicYear
  semester: Semester
  current?: SurahNumber
  lookups: Lookups
  onSave: (surah: SurahNumber) => void
}) {
  const [surah, setSurah] = useState<SurahNumber | undefined>(current)
  const view = studentClass(student, indexLookups(lookups))
  const context: [string, React.ReactNode][] = [
    ["الطالب", fullName(student)],
    ["المجموعة", view?.group?.name ?? "—"],
    ["المدرس المشرف", view?.supervisor ? fullName(view.supervisor) : "—"],
    ["الفرع", view?.branch?.name ?? "—"],
    ["السنة الدراسية", <span key="year" dir="ltr">{academicYear.label}</span>],
    ["السداسي", labels.semester[semester]],
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (surah) onSave(surah)
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookMarked className="size-5 text-primary" aria-hidden />
              تحديث الحفظ
            </DialogTitle>
            <DialogDescription>آخر سورة حفظها الطالب في هذا السداسي.</DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            {context.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-1.5">
            <Label htmlFor="memorization-surah">آخر سورة محفوظة</Label>
            <SurahCombobox id="memorization-surah" value={surah} onChange={setSurah} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" disabled={!surah || surah === current} className="min-w-24">
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Opens the memorization dialog for (student, year, semester) and saves to
 * the shared store (update if a value exists, create otherwise).
 * `updaterId` will be the logged-in teacher in Teacher Space; in the admin
 * prototype it defaults to the supervisor of the student's class.
 */
export function useMemorizationDialog({
  lookups,
  academicYears,
  today,
  updaterId,
}: {
  lookups: Lookups
  academicYears: AcademicYear[]
  today: ISODate
  updaterId?: ID
}) {
  const { memorizationProgress } = useOperations()
  const [target, setTarget] = useState<{ student: Student; academicYearId: ID; semester: Semester; key: number; open: boolean } | null>(null)

  const open = (student: Student, academicYearId: ID, semester: Semester) =>
    setTarget((prev) => ({ student, academicYearId, semester, key: (prev?.key ?? 0) + 1, open: true }))
  const close = (isOpen: boolean) => {
    if (!isOpen) setTarget((t) => (t ? { ...t, open: false } : t))
  }

  const year = target && academicYears.find((y) => y.id === target.academicYearId)
  const current = target
    ? getMemorizationProgress(memorizationProgress, target.student.id, target.academicYearId, target.semester)
    : undefined

  const dialog =
    target && year ? (
      <MemorizationDialog
        key={target.key}
        open={target.open}
        onOpenChange={close}
        student={target.student}
        academicYear={year}
        semester={target.semester}
        current={current?.lastMemorizedSurah}
        lookups={lookups}
        onSave={(surah) => {
          const teacherId = updaterId ?? defaultUpdater(target.student, lookups.groupClasses)
          if (!teacherId) return
          operations.saveMemorization({
            studentId: target.student.id,
            academicYearId: target.academicYearId,
            semester: target.semester,
            lastMemorizedSurah: surah,
            updatedByTeacherId: teacherId,
            updatedAt: today,
          })
          toast.success("تم تحديث متابعة الحفظ بنجاح", { description: `${fullName(target.student)}: ${surahLabel(surah)}` })
          close(false)
        }}
      />
    ) : null

  return { open, dialog }
}
