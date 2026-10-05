"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Branch, Group, ID } from "@/types/domain"

/** Active groups, grouped by branch. Used wherever a student is placed in a group. */
export function GroupSelect({
  id,
  value,
  onValueChange,
  groups,
  branches,
  excludeId,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onValueChange: (value: ID) => void
  groups: Group[]
  branches: Branch[]
  excludeId?: ID
  invalid?: boolean
  describedBy?: string
}) {
  const sections = branches
    .map((branch) => ({
      branch,
      groups: groups.filter(
        (g) =>
          g.branchId === branch.id &&
          g.id !== excludeId &&
          // keep the current value selectable even if its group was paused
          (g.status === "ACTIVE" || g.id === value)
      ),
    }))
    .filter((section) => section.groups.length > 0)

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        id={id}
        className="w-full"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <SelectValue placeholder="اختر مجموعة" />
      </SelectTrigger>
      <SelectContent position="popper">
        {sections.map(({ branch, groups }) => (
          <SelectGroup key={branch.id}>
            <SelectLabel>{branch.name}</SelectLabel>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
                <span className="text-xs text-muted-foreground">— {group.audience}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
