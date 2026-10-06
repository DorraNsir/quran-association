import { FileQuestion } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function TeacherNotFound() {
  return (
    <Card className="p-0">
      <EmptyState
        icon={FileQuestion}
        title="الملف غير موجود"
        description="ربما حُذف هذا السجل، أو أُضيف في هذه الجلسة التجريبية فقط ولم يُحفظ بعد في قاعدة البيانات."
        action={
          <Button asChild variant="outline">
            <Link href="/teacher">العودة إلى لوحة القيادة</Link>
          </Button>
        }
      />
    </Card>
  )
}
