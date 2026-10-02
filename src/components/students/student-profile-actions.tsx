"use client"

import { Pencil } from "lucide-react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { Button } from "@/components/ui/button"
import type { Lookups } from "@/lib/domain"
import type { Student } from "@/types/domain"

import { studentActions, useStudentDialogs } from "./use-student-dialogs"

export function StudentProfileActions({
  student,
  lookups,
}: {
  student: Student
  lookups: Lookups
}) {
  const { run, dialogs } = useStudentDialogs({ lookups })
  const secondary = studentActions(student, run, { includeView: false, includeEdit: false })

  return (
    <>
      <Button onClick={() => run("edit", student)}>
        <Pencil />
        تعديل
      </Button>
      <ActionsMenu label="إجراءات أخرى" actions={secondary} triggerVariant="outline" />
      {dialogs}
    </>
  )
}
