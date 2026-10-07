import Link from "next/link"

import { BrandLogo } from "@/components/layout/brand"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-4 text-center">
      <BrandLogo className="w-40" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">الصفحة غير موجودة</h1>
        <p className="text-sm text-muted-foreground">تعذّر العثور على الصفحة المطلوبة.</p>
      </div>
      <Button asChild>
        <Link href="/">العودة إلى الصفحة الرئيسية</Link>
      </Button>
    </main>
  )
}
