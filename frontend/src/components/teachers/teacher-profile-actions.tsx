"use client"

import { Pencil } from "lucide-react"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { Button } from "@/components/ui/button"
import type { Group, Teacher } from "@/types/domain"

import { teacherActions, useTeacherDialogs } from "./use-teacher-dialogs"

export function TeacherProfileActions({ teacher, groups }: { teacher: Teacher; groups: Group[] }) {
  const { run, dialogs } = useTeacherDialogs({ groups })

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
