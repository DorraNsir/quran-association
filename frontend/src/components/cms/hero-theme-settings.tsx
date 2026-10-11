"use client"

import { CheckCircle2, Eye, Globe, Loader2, Save } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
import { QueryState } from "@/components/shared/query-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import HeroBackground, { DEFAULT_HERO_THEME, HERO_THEMES, type HeroVariant } from "@/components/website/hero-background"
import { errorMessage } from "@/lib/api/errors"
import { useAdminSettings, useUpdateSettings } from "@/lib/api/hooks/settings"
import { amiri } from "@/lib/site-font"
import { cn } from "@/lib/utils"

const SAMPLE_TITLE = "بيئة تربوية لحفظ كتاب الله وتعلّمه"

/** A theme behind a short sample of the hero text (readability is part of the choice). */
function ThemePreview({ theme, compact, className }: { theme: HeroVariant; compact?: boolean; className?: string }) {
  return (
    <div className={cn("relative isolate overflow-hidden bg-[#0d1210]", amiri.variable, className)}>
      <HeroBackground variant={theme} compact={compact} textShade={!compact} lettersFont={amiri.style.fontFamily} />
      <div className={cn("relative z-10 flex h-full flex-col justify-center text-white", compact ? "gap-1 p-4" : "gap-3 p-8 sm:p-12")}>
        <p className={cn("font-display leading-tight font-bold", compact ? "text-lg" : "text-3xl sm:text-5xl")}>{SAMPLE_TITLE}</p>
        {!compact && (
          <div className="flex gap-2 pt-2">
            <span className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground">سجل الآن</span>
            <span className="rounded-full border border-white/40 bg-white/10 px-5 py-2 text-sm">اكتشف برامجنا</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * /admin/website/home — ONE animated background for the public hero (stored
 * in the site settings). Selecting a card or previewing changes nothing;
 * only «حفظ المظهر» saves, and the site shows the saved theme on its next load.
 */
export function HeroThemeSettings() {
  const settings = useAdminSettings()
  const update = useUpdateSettings()
  const current = settings.data?.website?.heroTheme ?? DEFAULT_HERO_THEME
  const [picked, setPicked] = useState<HeroVariant>()
  const selected = picked ?? current
  const [previewing, setPreviewing] = useState<HeroVariant | null>(null)
  const changed = selected !== current
  const nameOf = (theme: HeroVariant) => HERO_THEMES.find((t) => t.value === theme)?.name ?? theme

  async function save() {
    try {
      const saved = await update.mutateAsync({ website: { heroTheme: selected } })
      setPicked(undefined)
      toast.success("تم حفظ المظهر", { description: `يظهر الآن «${nameOf(saved.website?.heroTheme ?? selected)}» في واجهة الموقع.` })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const saveButton = (
    <Button type="button" onClick={save} disabled={!changed || update.isPending || !settings.data?.website}>
      {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
      حفظ المظهر
    </Button>
  )

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "الموقع الإلكتروني", href: "/admin/website" }, { label: "مظهر واجهة الصفحة الرئيسية" }]} />
      <PageHeader
        title="مظهر واجهة الصفحة الرئيسية"
        description="اختر الخلفية المتحركة التي ستظهر في واجهة الموقع الإلكتروني."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/" target="_blank"><Globe />عرض الموقع</Link>
            </Button>
            {saveButton}
          </>
        }
      />
      <QueryState query={settings}>
        {!settings.data?.website ? (
          <Alert>
            <AlertDescription>إعدادات الموقع غير مهيّأة بعد.</AlertDescription>
          </Alert>
        ) : (
          <>
            {changed && (
              <p role="status" className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                اخترت «{nameOf(selected)}» — لن يتغيّر الموقع قبل الضغط على «حفظ المظهر».
              </p>
            )}
            <div role="radiogroup" aria-label="مظاهر الواجهة" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {HERO_THEMES.map((theme) => {
                const isSelected = theme.value === selected
                const isCurrent = theme.value === current
                return (
                  <Card
                    key={theme.value}
                    className={cn(
                      "gap-0 overflow-hidden p-0 transition-shadow",
                      isSelected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/40"
                    )}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={theme.name}
                      onClick={() => setPicked(theme.value)}
                      className="block text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <ThemePreview theme={theme.value} compact className="aspect-[16/9]" />
                      <div className="space-y-1 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{theme.name}</p>
                          {isSelected ? (
                            <CheckCircle2 className="size-5 text-primary" aria-hidden />
                          ) : (
                            <span aria-hidden className="size-5 rounded-full border-2 border-muted-foreground/30" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{theme.description}</p>
                      </div>
                    </button>
                    <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
                      {isCurrent ? <Badge>المظهر الحالي</Badge> : <span />}
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewing(theme.value)}>
                        <Eye />
                        معاينة
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
            <div className="mt-6 flex justify-end">{saveButton}</div>
          </>
        )}
      </QueryState>

      <Dialog open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <DialogContent className="sm:max-w-4xl">
          {previewing && (
            <>
              <DialogHeader>
                <DialogTitle>معاينة «{nameOf(previewing)}»</DialogTitle>
                <DialogDescription>هكذا تظهر الواجهة بهذه الخلفية. المعاينة لا تغيّر الموقع.</DialogDescription>
              </DialogHeader>
              <ThemePreview theme={previewing} className="h-72 rounded-lg sm:h-96" />
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    setPicked(previewing)
                    setPreviewing(null)
                  }}
                >
                  اختيار هذا المظهر
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
