import { SearchX } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

import { EmptyState } from "./empty-state"

/** A record that does not exist (or is no longer accessible) — client pages' notFound(). */
export function NotFoundState({ title, backHref, backLabel }: { title: string; backHref: string; backLabel: string }) {
  return (
    <Card className="p-0">
      <EmptyState
        icon={SearchX}
        title={title}
        description="ربما حُذف أو لم يعد متاحًا لحسابك."
        action={
          <Button asChild variant="outline">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        }
      />
    </Card>
  )
}
