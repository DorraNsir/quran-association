"use client"

import { CalendarDays, Pencil } from "lucide-react"
import Link from "next/link"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { Button } from "@/components/ui/button"
import type { Lookups } from "@/lib/domain"
import type { Branch } from "@/types/domain"

import { branchActions, useBranchDialogs } from "./use-branch-dialogs"

export function BranchProfileActions({ branch, lookups }: { branch: Branch; lookups: Lookups }) {
  const { run, dialogs } = useBranchDialogs({ lookups })
  return (
    <>
      <Button onClick={() => run("edit", branch)}>
        <Pencil />
        تعديل
      </Button>
      <Button asChild variant="outline">
        <Link href={`/admin/calendar?branch=${branch.id}`}>
          <CalendarDays />
          الرزنامة
        </Link>
      </Button>
      <ActionsMenu
        label="إجراءات أخرى"
        triggerVariant="outline"
        actions={branchActions(branch, run, { includeView: false, includeEdit: false })}
      />
      {dialogs}
    </>
  )
}
