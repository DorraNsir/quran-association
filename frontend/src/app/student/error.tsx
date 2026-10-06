"use client"

import { AlertTriangle, RotateCcw } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

/** Error boundary for student pages — ready for failed API calls later. */
export default function StudentError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Card className="p-0">
      <EmptyState
        icon={AlertTriangle}
        title="تعذّر تحميل هذه الصفحة"
        description="حدث خطأ غير متوقع. أعد المحاولة، وإن تكرر الخطأ تواصل مع مسؤول المنصة."
        action={
          <Button variant="outline" onClick={() => retry()}>
            <RotateCcw />
            إعادة المحاولة
          </Button>
        }
      />
    </Card>
  )
}
