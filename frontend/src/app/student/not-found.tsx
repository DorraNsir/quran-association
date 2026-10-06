import { FileQuestion } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function StudentNotFound() {
  return (
    <Card className="p-0">
      <EmptyState
        icon={FileQuestion}
        title="الصفحة غير موجودة"
        description="تحقق من الرابط أو عد إلى لوحة القيادة."
        action={
          <Button asChild variant="outline">
            <Link href="/student">العودة إلى لوحة القيادة</Link>
          </Button>
        }
      />
    </Card>
  )
}
