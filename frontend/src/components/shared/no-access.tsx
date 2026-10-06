import { ShieldAlert } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

import { EmptyState } from "./empty-state"

/** Shown when the signed-in account may not open a page (UX only — the API enforces access). */
export function NoAccess({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <Card className="p-0">
      <EmptyState
        icon={ShieldAlert}
        title="ليس لديك صلاحية للوصول إلى هذه الصفحة"
        description="هذه الصفحة خارج نطاق حسابك. إن كنت تعتقد أن ذلك خطأ، تواصل مع إدارة الجمعية."
        action={
          <Button asChild variant="outline">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        }
      />
    </Card>
  )
}
