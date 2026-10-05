"use client"

import { Pencil } from "lucide-react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { Button } from "@/components/ui/button"
import type { Lookups } from "@/lib/domain"
import type { Teacher } from "@/types/domain"

import { teacherActions, useTeacherDialogs } from "./use-teacher-dialogs"

export function TeacherProfileActions({ teacher, lookups }: { teacher: Teacher; lookups: Lookups }) {
  const { run, dialogs } = useTeacherDialogs({ lookups })

  return (
    <>
      <Button onClick={() => run("edit", teacher)}>
        <Pencil />
        تعديل
      </Button>
      <ActionsMenu
        label="إجراءات أخرى"
        triggerVariant="outline"
        actions={teacherActions(teacher, run, { includeView: false, includeEdit: false })}
      />
      {dialogs}
    </>
  )
}
