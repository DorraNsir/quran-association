"use client"

import {
  Bug,
  CheckCircle2,
  CircleDot,
  Eye,
  ImagePlus,
  Inbox,
  Lightbulb,
  Loader2,
  type LucideIcon,
  MessageCircleReply,
  MessageSquareText,
  Search,
  SearchX,
  Send,
  Trash2,
  XCircle,
  Clock3,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters"
import { FormField } from "@/components/shared/form"
import { FormErrorAlert } from "@/components/shared/form-error-alert"
import { InfoList, SectionCard } from "@/components/shared/info-list"
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/api/errors"
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_TEXT_MAX,
  FEEDBACK_TITLE_MAX,
  feedbackCategoryLabel,
  feedbackStatusLabel,
  SCREENSHOT_ACCEPT,
  screenshotError,
  useAdminFeedback,
  useAdminFeedbackList,
  useMyFeedback,
  useMyFeedbackItem,
  useSendFeedback,
  useUpdateFeedback,
  type AdminFeedback,
  type Feedback,
  type FeedbackCategory,
  type FeedbackSpace,
  type FeedbackStatus,
} from "@/lib/api/feedback"
import { usePrivateFileUrl } from "@/lib/api/private-file"
import { formatDateTime } from "@/lib/format"
import { usePlatformSettings } from "@/lib/store/settings"
import { cn } from "@/lib/utils"

const TITLE = "الملاحظات والاقتراحات"

// ───────────────────────── badges ─────────────────────────

/** One look per category: an icon and a subtle colour, the words always say it too. */
export const CATEGORY_LOOK: Record<FeedbackCategory, { icon: LucideIcon; tone: string }> = {
  BUG: { icon: Bug, tone: "bg-destructive/10 text-destructive" },
  IMPROVEMENT: { icon: Lightbulb, tone: "bg-warning-soft text-warning" },
  OTHER: { icon: MessageSquareText, tone: "bg-muted text-muted-foreground" },
}

export const STATUS_LOOK: Record<FeedbackStatus, { icon: LucideIcon; tone: string }> = {
  NEW: { icon: CircleDot, tone: "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300" },
  REVIEWING: { icon: Clock3, tone: "bg-warning-soft text-warning" },
  RESOLVED: { icon: CheckCircle2, tone: "bg-brand-soft text-brand-soft-foreground" },
  CLOSED: { icon: XCircle, tone: "bg-muted text-muted-foreground" },
}

export function FeedbackCategoryBadge({ category }: { category: FeedbackCategory }) {
  const { icon: Icon, tone } = CATEGORY_LOOK[category]
  return (
    <Badge variant="outline" data-category={category} className={cn("gap-1 border-transparent", tone)}>
      <Icon className="size-3.5" aria-hidden />
      {feedbackCategoryLabel[category]}
    </Badge>
  )
}

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  const { icon: Icon, tone } = STATUS_LOOK[status]
  return (
    <Badge variant="outline" data-status={status} className={cn("gap-1 border-transparent", tone)}>
      <Icon className="size-3.5" aria-hidden />
      {feedbackStatusLabel[status]}
    </Badge>
  )
}

/** A private screenshot (fetched with the token, never a public URL); opens full size. */
function Screenshot({ url, alt }: { url: string; alt: string }) {
  const { src, isLoading, error } = usePrivateFileUrl(url)
  if (error) return <p className="text-sm text-muted-foreground">تعذّر تحميل الصورة.</p>
  if (isLoading || !src) return <div className="h-40 w-full max-w-sm animate-pulse rounded-lg bg-muted" role="status" aria-label="جارٍ تحميل الصورة" />
  return (
    <a href={src} target="_blank" rel="noreferrer" className="inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob: URL */}
      <img src={src} alt={alt} className="max-h-80 max-w-full rounded-lg border object-contain" />
    </a>
  )
}

// ───────────────────────── teacher / student ─────────────────────────

/** «الملاحظات والاقتراحات»: «إرسال ملاحظة» and «ملاحظاتي» (my own submissions only). */
export function MyFeedbackScreen({ space }: { space: FeedbackSpace }) {
  const pageSize = usePlatformSettings().defaultPageSize
  const [page, setPage] = useState(1)
  const [sending, setSending] = useState({ key: 0, open: false })
  const list = useMyFeedback(space, page, pageSize)
  const rows = list.data?.data ?? []

  return (
    <>
      <PageHeader
        title={TITLE}
        description="أبلغ عن مشكلة أو اقترح تحسينًا للتطبيق، وتابع ردّ الإدارة."
        actions={
          <Button onClick={() => setSending((s) => ({ key: s.key + 1, open: true }))}>
            <Send />
            إرسال ملاحظة
          </Button>
        }
      />
      <section aria-labelledby="my-feedback" className="space-y-3">
        <h2 id="my-feedback" className="text-base font-semibold">ملاحظاتي</h2>
        <QueryState
          query={list}
          empty={rows.length === 0}
          emptyIcon={MessageSquareText}
          emptyTitle="لم ترسل أي ملاحظات بعد"
          emptyDescription="ملاحظاتك تساعدنا على تحسين التطبيق."
        >
          <ul className="space-y-2" aria-label="ملاحظاتي">
            {rows.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/${space}/feedback/${f.id}`}
                  className="flex flex-col gap-2 rounded-xl border bg-card p-4 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium">{f.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <FeedbackCategoryBadge category={f.category} />
                      <span>{formatDateTime(f.createdAt)}</span>
                      {f.response && (
                        <span className="inline-flex items-center gap-1 text-primary" data-has-response>
                          <MessageCircleReply className="size-3.5" aria-hidden />
                          ردّت الإدارة
                        </span>
                      )}
                    </div>
                  </div>
                  <FeedbackStatusBadge status={f.status} />
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
        </QueryState>
      </section>
      <SendFeedbackDialog key={sending.key} space={space} open={sending.open} onOpenChange={(open) => setSending((s) => ({ ...s, open }))} />
    </>
  )
}

/** The form: category, title, description, optional screenshot. Success only once the server confirmed. */
export function SendFeedbackDialog({
  space,
  open,
  onOpenChange,
}: {
  space: FeedbackSpace
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const send = useSendFeedback(space)
  const [category, setCategory] = useState<FeedbackCategory>("BUG")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const sendingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const errors = {
    title: !title.trim() ? "العنوان مطلوب" : title.trim().length > FEEDBACK_TITLE_MAX ? `${FEEDBACK_TITLE_MAX} حرفًا على الأكثر` : undefined,
    description: !description.trim() ? "الوصف مطلوب" : description.trim().length > FEEDBACK_TEXT_MAX ? `${FEEDBACK_TEXT_MAX} حرف على الأكثر` : undefined,
  }
  const shown: Partial<typeof errors> = submitted ? errors : {}

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (errors.title || errors.description || sendingRef.current) return
    sendingRef.current = true // a second click never sends twice
    setServerError(null)
    try {
      const saved = await send.mutateAsync({ category, title, description, screenshot: file })
      toast.success("تم إرسال ملاحظتك بنجاح")
      onOpenChange(false)
      router.push(`/${space}/feedback/${saved.id}`)
    } catch (error) {
      setServerError(errorMessage(error))
    } finally {
      sendingRef.current = false
    }
  }

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = ""
    if (!picked) return
    const invalid = screenshotError(picked)
    setFileError(invalid)
    if (!invalid) setFile(picked)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !send.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>إرسال ملاحظة</DialogTitle>
            <DialogDescription>تصل ملاحظتك إلى الإدارة مع اسمك وتاريخ الإرسال.</DialogDescription>
          </DialogHeader>
          <ChoiceGroup
            label="نوع الملاحظة"
            value={category}
            onChange={setCategory}
            className="sm:grid-cols-3"
            choices={FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: feedbackCategoryLabel[c] }))}
          />
          <FormField id="fb-title" label="العنوان" required error={shown.title}>
            <Input
              id="fb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={FEEDBACK_TITLE_MAX}
              placeholder="مثال: زر الحفظ لا يعمل في صفحة الحصص"
              aria-invalid={Boolean(shown.title)}
            />
          </FormField>
          <FormField id="fb-description" label="الوصف" required error={shown.description}>
            <Textarea
              id="fb-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={FEEDBACK_TEXT_MAX}
              rows={5}
              placeholder="ماذا حدث؟ وما الذي كنت تتوقعه؟"
              aria-invalid={Boolean(shown.description)}
            />
          </FormField>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              لقطة شاشة <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
            </p>
            {preview ? (
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob: URL */}
                <img src={preview} alt="معاينة لقطة الشاشة" className="h-24 max-w-40 rounded-lg border object-contain" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>
                  <Trash2 />
                  إزالة
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <ImagePlus />
                إضافة صورة
              </Button>
            )}
            <input ref={inputRef} type="file" accept={SCREENSHOT_ACCEPT} onChange={pick} className="sr-only" aria-label="اختيار لقطة شاشة" tabIndex={-1} />
            {fileError ? (
              <p role="alert" className="text-xs text-destructive">{fileError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">JPG أو PNG أو WebP — 5 م.ب كحد أقصى.</p>
            )}
          </div>
          {serverError && <FormErrorAlert message={serverError} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
              إلغاء
            </Button>
            <Button type="submit" disabled={send.isPending} className="min-w-32">
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              إرسال الملاحظة
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** One of MY submissions: what I sent, its status, the screenshot and the admins' response. */
export function MyFeedbackDetail({ space, id }: { space: FeedbackSpace; id: string }) {
  const query = useMyFeedbackItem(space, id)
  const f = query.data
  return (
    <>
      <Breadcrumbs items={[{ label: TITLE, href: `/${space}/feedback` }, { label: f?.title ?? "ملاحظة" }]} />
      <QueryState query={query}>
        {f && (
          <div className="space-y-4">
            <PageHeader title={f.title} actions={<FeedbackStatusBadge status={f.status} />} />
            <FeedbackBody feedback={f} />
            <SectionCard title="ردّ الإدارة" icon={MessageCircleReply}>
              {f.response ? (
                <div className="space-y-2" data-response>
                  <p className="text-sm whitespace-pre-line">{f.response}</p>
                  {f.respondedAt && <p className="text-xs text-muted-foreground">{formatDateTime(f.respondedAt)}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">لم تردّ الإدارة بعد. ستصلك إشعارًا عند الرد أو تغيّر الحالة.</p>
              )}
            </SectionCard>
          </div>
        )}
      </QueryState>
    </>
  )
}

function FeedbackBody({ feedback: f, extra }: { feedback: Feedback; extra?: React.ReactNode }) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <FeedbackCategoryBadge category={f.category} />
        <span>أُرسلت في {formatDateTime(f.createdAt)}</span>
        {extra}
      </div>
      <p className="text-sm leading-7 whitespace-pre-line">{f.description}</p>
      {f.screenshot && <Screenshot url={f.screenshot.url} alt={`لقطة شاشة — ${f.title}`} />}
    </Card>
  )
}

// ───────────────────────── admin ─────────────────────────

/** «إدارة الملاحظات والاقتراحات»: every submission, server-side filters and pagination. */
export function AdminFeedbackScreen() {
  const pageSize = usePlatformSettings().defaultPageSize
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [category, setCategory] = useState(ALL)
  const [page, setPage] = useState(1)
  const search = useDeferredValue(query.trim())
  const list = useAdminFeedbackList({
    page,
    pageSize,
    search: search || undefined,
    status: status === ALL ? undefined : (status as FeedbackStatus),
    category: category === ALL ? undefined : (category as FeedbackCategory),
  })
  const rows = list.data?.data ?? []
  const filtered = Boolean(search) || status !== ALL || category !== ALL
  const newCount = list.data?.newCount ?? 0
  const href = (f: AdminFeedback) => `/admin/feedback/${f.id}`
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }
  const columns: Column<AdminFeedback>[] = [
    { id: "title", header: "العنوان", cell: (f) => <Link href={href(f)} className="font-medium hover:text-primary">{f.title}</Link> },
    { id: "category", header: "النوع", cell: (f) => <FeedbackCategoryBadge category={f.category} /> },
    {
      id: "sender",
      header: "المرسل",
      cell: (f) => (
        <span className="whitespace-nowrap">
          {f.sender.name} <span className="text-xs text-muted-foreground">· {f.senderRole === "TEACHER" ? "معلم" : "طالب"}</span>
        </span>
      ),
    },
    { id: "date", header: "التاريخ", className: "hidden md:table-cell", cell: (f) => <span className="whitespace-nowrap">{formatDateTime(f.createdAt)}</span> },
    { id: "status", header: "الحالة", cell: (f) => <FeedbackStatusBadge status={f.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">الإجراءات</span>,
      cell: (f) => (
        <Button asChild size="sm" variant={f.status === "NEW" ? "default" : "ghost"}>
          <Link href={href(f)}>
            <Eye />
            {f.status === "NEW" ? "مراجعة" : "عرض"}
          </Link>
        </Button>
      ),
    },
  ]
  return (
    <>
      <PageHeader title={`إدارة ${TITLE}`} description={`ملاحظات المعلمين والطلبة حول التطبيق${newCount ? ` — ${newCount} جديدة` : ""}.`} />
      <FilterBar
        hasActiveFilters={filtered}
        onReset={() => {
          setQuery("")
          setStatus(ALL)
          setCategory(ALL)
          setPage(1)
        }}
        resultLabel={list.data ? `${list.data.meta.total} ملاحظة` : ""}
        search={<SearchInput value={query} onChange={reset(setQuery)} label="البحث في الملاحظات" placeholder="ابحث بالعنوان أو المرسل…" />}
      >
        <FilterSelect label="الحالة" allLabel="كل الحالات" value={status} onValueChange={reset(setStatus)}
          options={FEEDBACK_STATUSES.map((s) => ({ value: s, label: feedbackStatusLabel[s] }))} />
        <FilterSelect label="النوع" allLabel="كل الأنواع" value={category} onValueChange={reset(setCategory)}
          options={FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: feedbackCategoryLabel[c] }))} />
      </FilterBar>
      <QueryState query={list}>
        <DataTable
          key={`${search}|${status}|${category}|${page}`}
          caption={TITLE}
          columns={columns}
          rows={rows}
          getRowId={(f) => f.id}
          emptyState={<EmptyState icon={filtered ? SearchX : Inbox} title={filtered ? "لا توجد ملاحظات مطابقة" : "لا توجد ملاحظات جديدة"} />}
          renderMobileCard={(f) => (
            <Link href={href(f)} className="block space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{f.title}</p>
                <FeedbackStatusBadge status={f.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <FeedbackCategoryBadge category={f.category} />
                <span>{f.sender.name}</span>
                <span>{formatDateTime(f.createdAt)}</span>
              </div>
            </Link>
          )}
        />
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>
    </>
  )
}

const PLATFORM_LABEL = { WEB: "الويب", ANDROID: "أندرويد", IOS: "iOS" } as const

/** One submission: the sender and context, the status and the response editor. */
export function AdminFeedbackDetail({ id }: { id: string }) {
  const query = useAdminFeedback(id)
  const f = query.data
  return (
    <>
      <Breadcrumbs items={[{ label: `إدارة ${TITLE}`, href: "/admin/feedback" }, { label: f?.title ?? "ملاحظة" }]} />
      <QueryState query={query}>
        {f && (
          <div className="space-y-4">
            <PageHeader title={f.title} actions={<FeedbackStatusBadge status={f.status} />} />
            <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
              <div className="space-y-4">
                <FeedbackBody feedback={f} />
                <ResponseEditor key={f.version} feedback={f} />
              </div>
              <SectionCard title="معلومات الإرسال" icon={Search}>
                <InfoList
                  items={[
                    { label: "المرسل", value: `${f.sender.name} (${f.senderRole === "TEACHER" ? "معلم" : "طالب"})` },
                    { label: "تاريخ الإرسال", value: formatDateTime(f.createdAt) },
                    { label: "آخر تحديث", value: formatDateTime(f.updatedAt) },
                    { label: "المنصة", value: f.platform ? PLATFORM_LABEL[f.platform] : undefined },
                    { label: "إصدار التطبيق", value: f.appVersion ? <span dir="ltr">{f.appVersion}</span> : undefined },
                    { label: "الصفحة", value: f.screenPath ? <span dir="ltr" className="break-all">{f.screenPath}</span> : undefined },
                  ]}
                />
              </SectionCard>
            </div>
          </div>
        )}
      </QueryState>
    </>
  )
}

function ResponseEditor({ feedback: f }: { feedback: AdminFeedback }) {
  const update = useUpdateFeedback(f.id)
  const [status, setStatus] = useState<FeedbackStatus>(f.status)
  const [response, setResponse] = useState(f.response ?? "")
  const [error, setError] = useState<string | null>(null)
  const changed = status !== f.status || response.trim() !== (f.response ?? "")

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!changed || update.isPending) return
    setError(null)
    try {
      await update.mutateAsync({
        version: f.version,
        ...(status !== f.status ? { status } : {}),
        ...(response.trim() !== (f.response ?? "") ? { response: response.trim() || null } : {}),
      })
      toast.success("تم حفظ التغييرات")
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <SectionCard title="ردّ الإدارة" icon={MessageCircleReply}>
      <form onSubmit={save} className="space-y-4">
        <FormField id="fb-status" label="الحالة">
          <Select value={status} onValueChange={(v) => setStatus(v as FeedbackStatus)}>
            <SelectTrigger id="fb-status" className="w-full sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {FEEDBACK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {feedbackStatusLabel[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          id="fb-response"
          label="الرد على المرسل"
          optional
          description={
            f.respondedAt
              ? `آخر رد: ${f.respondedBy?.name ?? "—"} — ${formatDateTime(f.respondedAt)}`
              : "يراه المرسل في ملاحظاته ويصله إشعار."
          }
        >
          <Textarea
            id="fb-response"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            maxLength={FEEDBACK_TEXT_MAX}
            rows={4}
            placeholder="مثال: شكرًا على ملاحظتك. تم إصلاح المشكلة في صفحة الحصص."
          />
        </FormField>
        {error && <FormErrorAlert message={error} />}
        <div className="flex justify-end">
          <Button type="submit" disabled={!changed || update.isPending} className="min-w-28">
            {update.isPending && <Loader2 className="animate-spin" />}
            حفظ
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}
