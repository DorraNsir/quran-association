"use client"

import { RotateCcw } from "lucide-react"

import { Container } from "@/components/website/blocks"
import { Button } from "@/components/ui/button"

/** Public pages whose content could not be read from the API (server unreachable…). */
export default function SiteError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Container className="py-24 text-center">
      <h1 className="font-display text-3xl font-bold">تعذّر تحميل هذه الصفحة</h1>
      <p className="mt-2 text-muted-foreground">يرجى إعادة المحاولة بعد قليل.</p>
      <Button variant="outline" className="mt-6 rounded-full" onClick={() => retry()}>
        <RotateCcw />
        إعادة المحاولة
      </Button>
    </Container>
  )
}
