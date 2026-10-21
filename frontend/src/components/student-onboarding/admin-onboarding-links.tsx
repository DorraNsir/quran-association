"use client"

import { Ban, CalendarClock, Copy, Link2, Plus, QrCode, RefreshCw, Download } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ActionsMenu } from "@/components/shared/actions-menu"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterSelect } from "@/components/shared/filters"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { FormErrorAlert } from "@/components/shared/form-error-alert"
import { PageHeader } from "@/components/shared/page-header"
import { QueryState } from "@/components/shared/query-state"
import { WithLookups } from "@/components/shared/with-lookups"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage } from "@/lib/api/errors"
import {
  fetchLinkUrl,
  useCreateOnboardingLink,
  useExtendOnboardingLink,
  useOnboardingLinks,
  useOnboardingStatus,
  useReplaceOnboardingLink,
  useRevokeOnboardingLink,
  type LinkStatus,
  type OnboardingLink,
} from "@/lib/api/student-onboarding"
import { addDays, todayInTunis } from "@/lib/dates"
import { describeClass, fullName, indexLookups, type Lookups } from "@/lib/domain"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export const LINK_STATUS_LABEL: Record<LinkStatus, string> = { ACTIVE: "نشط", EXPIRED: "منتهي الصلاحية", REVOKED: "معطّل" }
const LINK_STATUS_STYLE: Record<LinkStatus, string> = {
  ACTIVE: "bg-brand-soft text-brand-soft-foreground",
  EXPIRED: "bg-warning-soft text-warning",
  REVOKED: "bg-muted text-muted-foreground",
}

/** Header + the two tabs of the TEMPORARY module, and a notice when it is switched off. */
export function OnboardingShell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  const pathname = usePathname()
  const status = useOnboardingStatus()
  const tabs = [
    { href: "/admin/student-onboarding", label: "روابط الاستكمال" },
    { href: "/admin/student-onboarding/submissions", label: "طلبات الاستكمال" },
  ]
  return (
    <>
      <PageHeader
        title="استكمال بيانات الطلبة"
        description="وحدة مؤقتة: رابط لكل فوج يملأ به الطلبة أو أولياؤهم بياناتهم، ثم تراجع الإدارة كل طلب قبل إضافة الطالب."
        actions={actions}
      />
      {status.data && !status.data.enabled && (
        <Alert className="mb-4">
          <Ban aria-hidden />
          <AlertTitle>الوحدة معطّلة حاليًا</AlertTitle>
          <AlertDescription>لا تُقبل استمارات جديدة ولا يمكن تعديل الروابط أو معالجة الطلبات. تبقى البيانات المحفوظة للاطلاع.</AlertDescription>
        </Alert>
      )}
      <nav aria-label="أقسام الوحدة" className="mb-6 flex gap-1 border-b">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={pathname === t.href ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              pathname === t.href ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  )
}

/** Default expiry: two weeks from today, end of day (Africa/Tunis wall-clock). */
const defaultExpiry = () => ({ date: addDays(todayInTunis(), 14), time: "23:59" })

export function OnboardingLinksScreen() {
  return <WithLookups>{(lookups) => <LinksView lookups={lookups} />}</WithLookups>
}

function LinksView({ lookups }: { lookups: Lookups }) {
  const [status, setStatus] = useState(ALL)
  const links = useOnboardingLinks(status === ALL ? undefined : (status as LinkStatus))
  const [creating, setCreating] = useState<{ key: number; open: boolean } | null>(null)
  const [shared, setShared] = useState<{ url: string; title: string } | null>(null)
  const [extending, setExtending] = useState<{ link: OnboardingLink; mode: "extend" | "replace" } | null>(null)
  const [revoking, setRevoking] = useState<OnboardingLink | null>(null)
  const revoke = useRevokeOnboardingLink()

  const classTitle = (l: OnboardingLink) =>
    `${l.groupClass.group.name} — ${l.groupClass.branch.name}${l.groupClass.supervisorName ? ` (${l.groupClass.supervisorName})` : ""}`

  /** The URL is fetched only now (never part of the list). */
  async function reveal(l: OnboardingLink, then: "copy" | "qr") {
    try {
      const { url } = await fetchLinkUrl(l.id)
      if (then === "copy") {
        await navigator.clipboard.writeText(url)
        toast.success("تم نسخ الرابط")
      } else setShared({ url, title: classTitle(l) })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const columns: Column<OnboardingLink>[] = [
    { id: "branch", header: "الفرع", cell: (l) => l.groupClass.branch.name },
    { id: "group", header: "المجموعة", cell: (l) => <span className="font-medium">{l.groupClass.group.name}</span> },
    { id: "class", header: "الفوج", cell: (l) => <span className="text-sm text-muted-foreground">{l.groupClass.supervisorName ? `فوج ${l.groupClass.supervisorName}` : "—"}</span> },
    {
      id: "status",
      header: "الحالة",
      cell: (l) => <Badge variant="outline" className={cn("border-transparent", LINK_STATUS_STYLE[l.status])}>{LINK_STATUS_LABEL[l.status]}</Badge>,
    },
    { id: "expires", header: "انتهاء الصلاحية", cell: (l) => <span dir="ltr" className="inline-block text-sm tabular-nums">{formatDateTime(l.expiresAt)}</span> },
    { id: "total", header: "الطلبات", className: "text-center", cell: (l) => <span className="tabular-nums">{l.submissions.total}</span> },
    { id: "pending", header: "بانتظار المراجعة", className: "hidden text-center md:table-cell", cell: (l) => <span className={cn("tabular-nums", l.submissions.pending > 0 && "font-medium text-warning")}>{l.submissions.pending}</span> },
    { id: "approved", header: "مقبولة", className: "hidden text-center md:table-cell", cell: (l) => <span className="tabular-nums">{l.submissions.approved}</span> },
    { id: "rejected", header: "مرفوضة", className: "hidden text-center md:table-cell", cell: (l) => <span className="tabular-nums">{l.submissions.rejected}</span> },
    {
      id: "actions",
      header: <span className="sr-only">إجراءات</span>,
      cell: (l) => (
        <ActionsMenu
          label={`إجراءات رابط ${classTitle(l)}`}
          actions={[
            ...(l.status !== "REVOKED"
              ? [
                  { label: "نسخ الرابط", icon: Copy, onSelect: () => reveal(l, "copy") },
                  { label: "عرض رمز QR", icon: QrCode, onSelect: () => reveal(l, "qr") },
                  { label: "تمديد الصلاحية", icon: CalendarClock, onSelect: () => setExtending({ link: l, mode: "extend" as const }) },
                ]
              : []),
            { label: "إنشاء رابط بديل", icon: RefreshCw, separated: l.status !== "REVOKED", onSelect: () => setExtending({ link: l, mode: "replace" as const }) },
            ...(l.status !== "REVOKED" ? [{ label: "تعطيل الرابط", icon: Ban, destructive: true, onSelect: () => setRevoking(l) }] : []),
          ]}
        />
      ),
    },
  ]

  return (
    <OnboardingShell
      actions={
        <Button onClick={() => setCreating((c) => ({ key: (c?.key ?? 0) + 1, open: true }))}>
          <Plus />
          إنشاء رابط
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterSelect
          label="حالة الرابط"
          allLabel="كل الروابط"
          value={status}
          onValueChange={setStatus}
          options={(["ACTIVE", "EXPIRED", "REVOKED"] as const).map((s) => ({ value: s, label: LINK_STATUS_LABEL[s] }))}
        />
      </div>
      <QueryState query={links}>
        <DataTable
          caption="روابط الاستكمال"
          columns={columns}
          rows={links.data ?? []}
          getRowId={(l) => l.id}
          emptyState={<EmptyState icon={Link2} title="لا توجد روابط بعد" description="أنشئ رابطًا لكل فوج ثم شاركه مع الطلبة أو أوليائهم." />}
        />
      </QueryState>

      {creating && (
        <CreateLinkSheet
          key={creating.key}
          open={creating.open}
          onOpenChange={(open) => !open && setCreating((c) => (c ? { ...c, open: false } : c))}
          lookups={lookups}
          onCreated={(url, title) => setShared({ url, title })}
        />
      )}
      {extending && (
        <ExpiryDialog
          key={`${extending.link.id}-${extending.mode}`}
          link={extending.link}
          mode={extending.mode}
          title={classTitle(extending.link)}
          onClose={() => setExtending(null)}
          onReplaced={(url) => setShared({ url, title: classTitle(extending.link) })}
        />
      )}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        destructive
        title="تعطيل هذا الرابط؟"
        description="لن يقبل الرابط أي استمارة جديدة. تبقى الطلبات المرسلة سابقًا للمراجعة، ولا يتأثر أي طالب مسجّل."
        confirmLabel="تعطيل الرابط"
        onConfirm={async () => {
          if (!revoking) return
          await revoke.mutateAsync(revoking.id)
          setRevoking(null)
          toast.success("تم تعطيل الرابط")
        }}
      />
      {shared && <ShareDialog url={shared.url} title={shared.title} onClose={() => setShared(null)} />}
    </OnboardingShell>
  )
}

function CreateLinkSheet({
  open,
  onOpenChange,
  lookups,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lookups: Lookups
  onCreated: (url: string, title: string) => void
}) {
  const create = useCreateOnboardingLink()
  const indexes = indexLookups(lookups)
  const [branchId, setBranchId] = useState("")
  const [groupId, setGroupId] = useState("")
  const [classId, setClassId] = useState("")
  const [{ date, time }, setExpiry] = useState(defaultExpiry)
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const classes = lookups.groupClasses.filter((c) => c.status !== "ARCHIVED" && (!branchId || c.branchId === branchId) && (!groupId || c.groupId === groupId))
  const groups = lookups.groups.filter((g) => g.status !== "ARCHIVED" && lookups.groupClasses.some((c) => c.groupId === g.id && (!branchId || c.branchId === branchId)))
  const invalid = !classId || !date || !time

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="إنشاء رابط استكمال"
      description="رابط واحد لكل فوج، صالح إلى غاية تاريخ انتهاء الصلاحية (بتوقيت تونس)."
      submitLabel="إنشاء الرابط"
      pending={create.isPending}
      error={error}
      onSubmit={async (e) => {
        e.preventDefault()
        setTried(true)
        if (invalid) return
        setError(null)
        try {
          const created = await create.mutateAsync({ groupClassId: classId, expiresAt: `${date}T${time}` })
          toast.success("تم إنشاء الرابط")
          onOpenChange(false)
          const c = created.groupClass
          onCreated(created.url, `${c.group.name} — ${c.branch.name}`)
        } catch (err) {
          setError(errorMessage(err))
        }
      }}
    >
      <FormSection title="الفوج">
        <FormField label="الفرع" required id="ob-branch" className="sm:col-span-2">
          <Select value={branchId} onValueChange={(v) => (setBranchId(v), setGroupId(""), setClassId(""))}>
            <SelectTrigger id="ob-branch" className="w-full"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent position="popper">
              {lookups.branches.filter((b) => b.status === "ACTIVE").map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="المجموعة" required id="ob-group" className="sm:col-span-2">
          <Select value={groupId} onValueChange={(v) => (setGroupId(v), setClassId(""))} disabled={!branchId}>
            <SelectTrigger id="ob-group" className="w-full"><SelectValue placeholder="اختر المجموعة" /></SelectTrigger>
            <SelectContent position="popper">
              {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="الفوج" required id="ob-class" className="sm:col-span-2" error={tried && !classId ? "اختر الفوج" : undefined}>
          <Select value={classId} onValueChange={setClassId} disabled={!groupId}>
            <SelectTrigger id="ob-class" className="w-full"><SelectValue placeholder="اختر الفوج" /></SelectTrigger>
            <SelectContent position="popper">
              {classes.map((c) => {
                const view = describeClass(c, indexes)
                return (
                  <SelectItem key={c.id} value={c.id}>
                    {view.supervisor ? `فوج ${fullName(view.supervisor)}` : "فوج"}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </FormField>
      </FormSection>
      <FormSection title="الصلاحية">
        <ExpiryFields date={date} time={time} onChange={setExpiry} />
      </FormSection>
    </FormSheet>
  )
}

function ExpiryFields({ date, time, onChange }: { date: string; time: string; onChange: (v: { date: string; time: string }) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ob-exp-date">تاريخ انتهاء الصلاحية</Label>
        <Input id="ob-exp-date" type="date" dir="ltr" min={todayInTunis()} value={date} onChange={(e) => onChange({ date: e.target.value, time })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ob-exp-time">الساعة (بتوقيت تونس)</Label>
        <Input id="ob-exp-time" type="time" dir="ltr" value={time} onChange={(e) => onChange({ date, time: e.target.value })} />
      </div>
    </>
  )
}

/** «تمديد الصلاحية» or «إنشاء رابط بديل» (the old URL stops at once). */
function ExpiryDialog({
  link,
  mode,
  title,
  onClose,
  onReplaced,
}: {
  link: OnboardingLink
  mode: "extend" | "replace"
  title: string
  onClose: () => void
  onReplaced: (url: string) => void
}) {
  const extend = useExtendOnboardingLink()
  const replace = useReplaceOnboardingLink()
  const [expiry, setExpiry] = useState(defaultExpiry)
  const [error, setError] = useState<string | null>(null)
  const pending = extend.isPending || replace.isPending

  async function confirm() {
    setError(null)
    const expiresAt = `${expiry.date}T${expiry.time}`
    try {
      if (mode === "extend") {
        await extend.mutateAsync({ id: link.id, expiresAt })
        toast.success("تم تمديد الصلاحية")
      } else {
        const created = await replace.mutateAsync({ id: link.id, expiresAt })
        toast.success("تم إنشاء رابط بديل — الرابط القديم لم يعد صالحًا")
        onReplaced(created.url)
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "extend" ? "تمديد الصلاحية" : "إنشاء رابط بديل"}</DialogTitle>
          <DialogDescription>
            {title}.{" "}
            {mode === "replace"
              ? "سيتوقف الرابط الحالي فورًا عن العمل ويُنشأ رابط جديد لنفس الفوج. تبقى الطلبات المرسلة سابقًا."
              : "يبقى الرابط نفسه صالحًا إلى غاية التاريخ الجديد."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <ExpiryFields date={expiry.date} time={expiry.time} onChange={setExpiry} />
        </div>
        <FormErrorAlert message={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant={mode === "replace" ? "destructive" : "default"} disabled={pending} onClick={confirm}>
            {mode === "extend" ? "تمديد" : "إنشاء رابط بديل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The link to share (WhatsApp…) and its QR code — copy or download. */
function ShareDialog({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: "M" }).then((data) => alive && setQr(data))
    return () => {
      alive = false
    }
  }, [url])
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>رابط الاستكمال</DialogTitle>
          <DialogDescription>{title} — شاركه مع الطلبة أو أوليائهم (واتساب…).</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, nothing for next/image to optimize */}
          {qr ? <img src={qr} alt={`رمز QR لرابط ${title}`} className="size-56 rounded-lg border bg-white p-2" /> : <div className="size-56 animate-pulse rounded-lg bg-muted" />}
          <p dir="ltr" className="w-full break-all rounded-lg bg-muted/60 px-3 py-2 text-center text-xs">{url}</p>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(url)
              toast.success("تم نسخ الرابط")
            }}
          >
            <Copy />
            نسخ الرابط
          </Button>
          {qr && (
            <Button asChild variant="outline">
              <a href={qr} download="qr-استكمال-البيانات.png">
                <Download />
                تحميل رمز QR
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
