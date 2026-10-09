import { DoorOpen, UserX } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { Card } from "@/components/ui/card"

/** The account points to a student record that no longer exists. */
export function StudentNotFound() {
  return (
    <Card className="p-0">
      <EmptyState icon={UserX} title="تعذّر العثور على ملفك" description="تواصل مع إدارة الجمعية لتحديث حسابك." />
    </Card>
  )
}

export function NoGroupClass() {
  return (
    <Card className="p-0">
      <EmptyState icon={DoorOpen} title="لم يتم إسنادك إلى مجموعة حالياً" description="ستظهر هنا مجموعتك ومعلموك عند إسنادك إلى قسم." />
    </Card>
  )
}
