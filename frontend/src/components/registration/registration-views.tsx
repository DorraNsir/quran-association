"use client"

import { useQuery } from "@tanstack/react-query"
import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, Eye, Globe, Loader2, Phone, Plus, SearchX, ShieldCheck, UserCheck, UserPlus, UserX } from "lucide-react"
import Link from "next/link"
import { useDeferredValue, useState } from "react"
import { toast } from "sonner"

import { StudentFormSheet } from "@/components/students/student-form-sheet"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters"
import { InfoList, PhoneLink } from "@/components/shared/info-list"
import { NotFoundState } from "@/components/shared/not-found-state"
import { PageHeader, Breadcrumbs } from "@/components/shared/page-header"
import { Pager } from "@/components/shared/pager"
import { ErrorState, LoadingState, QueryState } from "@/components/shared/query-state"
import { WithLookups } from "@/components/shared/with-lookups"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api/client"
import { ApiError, errorMessage } from "@/lib/api/errors"
import {
  toRegistrationRequest,
  useAcceptRegistration,
  useAddRegistrationRequest,
  useRegistrationRequest,
  useRegistrationRequests,
  useRejectRegistration,
  useSubmitPublicRegistration,
  type AcceptInput,
  type DuplicateCandidate,
} from "@/lib/api/hooks/registration"
import type { StudentInput } from "@/lib/api/hooks/people"
import { usePublicSiteSettings } from "@/lib/api/public-settings"
import { todayInTunis } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { canReviewRequest, requestAge } from "@/lib/registration"
import { useAdminDate, usePlatformSettings } from "@/lib/store/settings"
import { cn } from "@/lib/utils"
import type { ID, RegistrationRequest, RegistrationRequestStatus } from "@/types/domain"

import { useRegistrationForm } from "./registration-form"

export function RegistrationStatusBadge({ status }: { status: RegistrationRequestStatus }) {
  const tone = { PENDING: "bg-warning-soft text-warning", ACCEPTED: "bg-brand-soft text-brand-soft-foreground", REFUSED: "bg-muted text-muted-foreground" }[status]
  return <Badge className={cn("font-normal", tone)}>{labels.registrationStatus[status]}</Badge>
}

export function RegistrationSourceBadge({ source }: { source: RegistrationRequest["source"] }) {
  const Icon = source === "PUBLIC_WEBSITE" ? Globe : ShieldCheck
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Icon aria-hidden />
      {labels.registrationSource[source]}
    </Badge>
  )
}

/** An announced group of the public site (GET /api/public/upcoming-groups). */
interface PublicGroupListing {
  id: string
  title: string
  groupId: string | null
  registrationOpen: boolean
}

/**
 * Public pre-registration — creates a PENDING request only (no student, no
 * account, no class, no payment). `interestId` (an announced upcoming group)
 * is recorded as interest; the class stays an admission decision.
 */
export function PublicRegistrationForm({ interestId }: { interestId?: string }) {
  const today = todayInTunis()
  const form = useRegistrationForm(today)
  const [sent, setSent] = useState(false)
  const settings = usePublicSiteSettings()
  const groups = useQuery({
    queryKey: ["public", "upcoming-groups"],
    queryFn: ({ signal }) => api<PublicGroupListing[]>("/public/upcoming-groups", { auth: false, signal }),
    enabled: !!interestId,
  })
  const submit = useSubmitPublicRegistration()
  const interest = interestId ? groups.data?.find((g) => g.id === interestId && g.registrationOpen) : undefined

  if (settings.isPending) return <LoadingState />
  if (settings.isError) return <Card className="mx-auto w-full max-w-xl p-0"><ErrorState error={settings.error} onRetry={() => settings.refetch()} /></Card>
  if (!settings.data.registrationEnabled) {
    return (
      <Card className="mx-auto w-full max-w-xl p-8 text-center">
        <p className="text-lg font-semibold">التسجيل عبر الموقع مغلق حالياً</p>
        <p className="mt-1 text-sm text-muted-foreground">يمكنكم التواصل مع الجمعية مباشرة للاستفسار.</p>
      </Card>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      {interest && !sent && (
        <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand-soft-foreground">
          طلب تسجيل في: <span className="font-semibold">{interest.title}</span> — تحدّد الإدارة الحلقة المناسبة عند قبول الطلب.
        </p>
      )}
      <Card className="rounded-3xl p-5 sm:p-7">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-10 text-primary" aria-hidden />
            <p className="text-lg font-semibold">تم إرسال طلب التسجيل بنجاح</p>
            <p className="text-sm text-muted-foreground">سيتواصل معك فريق الجمعية لاحقاً.</p>
          </div>
        ) : (
          <form
            noValidate
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault()
              if (submit.isPending) return
              const fields = form.collect()
              if (!fields) return
              submit.mutate(
                { ...fields, interestedGroupId: interest?.groupId ?? undefined, interestedProgramLabel: interest?.title },
                { onSuccess: () => setSent(true) }
              )
            }}
          >
            {form.fields("public", "self")}
            {submit.isError && (
              <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage(submit.error)}</p>
            )}
            <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base" disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="animate-spin" />}
              إرسال طلب التسجيل
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}

/** Admin entry of a request (visit, phone call…): same entity, source ADMIN, still PENDING. */
function AddRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const form = useRegistrationForm(todayInTunis())
  const add = useAddRegistrationRequest()
  return (
    <Dialog open={open} onOpenChange={(next) => !add.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (add.isPending) return
            const fields = form.collect()
            if (!fields) return
            add.mutate(fields, {
              onSuccess: () => {
                onOpenChange(false)
                toast.success("تمت إضافة طلب التسجيل", { description: "الحالة: قيد الانتظار — لم يُنشأ ملف طالب بعد." })
              },
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>إضافة طلب تسجيل</DialogTitle>
            <DialogDescription>لمن حضر إلى الجمعية أو اتصل هاتفيًا. يُراجَع الطلب ثم يُقبل أو يُرفض.</DialogDescription>
          </DialogHeader>
          {form.fields("admin-req", "applicant")}
          {add.isError && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage(add.error)}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={add.isPending} onClick={() => onOpenChange(false)}>{labels.common.cancel}</Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              إضافة الطلب
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type RequestRow = ReturnType<typeof toRegistrationRequest>

/** Server-side filters and pagination (GET /api/admin/registration-requests). */
export function RegistrationRequestsView() {
  const today = todayInTunis()
  const adminDate = useAdminDate()
  const pageSize = usePlatformSettings().defaultPageSize
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [source, setSource] = useState(ALL)
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState({ key: 0, open: false })
  const search = useDeferredValue(query.trim())
  const list = useRegistrationRequests({
    page,
    pageSize,
    search: search || undefined,
    status: status === ALL ? undefined : status,
    source: source === ALL ? undefined : source,
  })
  const pending = useRegistrationRequests({ page: 1, pageSize: 1, status: "PENDING" }).data?.meta.total ?? 0
  const rows = (list.data?.data ?? []).map(toRegistrationRequest)
  const filtered = Boolean(search) || status !== ALL || source !== ALL
  const href = (r: RegistrationRequest) => `/admin/registration-requests/${r.id}`
  const ageCell = (r: RegistrationRequest) => {
    const age = requestAge(r, today)
    return age === undefined ? "—" : `${age} سنة`
  }
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  const columns: Column<RequestRow>[] = [
    {
      id: "applicant",
      header: "المترشح",
      cell: (r) => (
        <Link href={href(r)} className="font-medium hover:text-primary">{r.firstName} {r.lastName}</Link>
      ),
    },
    { id: "phone", header: "الهاتف", cell: (r) => <span dir="ltr" className="tabular-nums">{r.phone}</span> },
    { id: "age", header: "العمر", cell: ageCell },
    { id: "studied", header: "دراسة سابقة", className: "hidden lg:table-cell", cell: (r) => (r.hasStudiedQuranBefore ? "نعم" : "لا") },
    { id: "source", header: "المصدر", cell: (r) => <RegistrationSourceBadge source={r.source} /> },
    { id: "date", header: "تاريخ الطلب", className: "hidden md:table-cell", cell: (r) => <span className="whitespace-nowrap">{adminDate(r.submittedAt)}</span> },
    { id: "status", header: "الحالة", cell: (r) => <RegistrationStatusBadge status={r.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">الإجراءات</span>,
      cell: (r) => (
        <Button asChild size="sm" variant={r.status === "PENDING" ? "default" : "ghost"}>
          <Link href={href(r)}>
            <Eye />
            {r.status === "PENDING" ? "مراجعة" : "عرض"}
          </Link>
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="طلبات التسجيل"
        description={`طلبات من الموقع الإلكتروني أو مُدخلة من الإدارة${pending ? ` — ${pending} قيد الانتظار` : ""}.`}
        actions={
          <Button onClick={() => setAdding((p) => ({ key: p.key + 1, open: true }))}>
            <Plus />
            إضافة طلب تسجيل
          </Button>
        }
      />
      <FilterBar
        hasActiveFilters={filtered}
        onReset={() => {
          setQuery("")
          setStatus(ALL)
          setSource(ALL)
          setPage(1)
        }}
        resultLabel={list.data ? `${list.data.meta.total} طلب` : ""}
        search={<SearchInput value={query} onChange={reset(setQuery)} label="البحث في الطلبات" placeholder="ابحث بالاسم أو الهاتف…" />}
      >
        <FilterSelect label="الحالة" allLabel="كل الحالات" value={status} onValueChange={reset(setStatus)}
          options={(["PENDING", "ACCEPTED", "REFUSED"] as const).map((s) => ({ value: s, label: labels.registrationStatus[s] }))} />
        <FilterSelect label="المصدر" allLabel="كل المصادر" value={source} onValueChange={reset(setSource)}
          options={(["PUBLIC_WEBSITE", "ADMIN"] as const).map((s) => ({ value: s, label: labels.registrationSource[s] }))} />
      </FilterBar>
      <QueryState query={list}>
        <DataTable
          key={`${search}|${status}|${source}|${page}`}
          caption="طلبات التسجيل"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          emptyState={<EmptyState icon={filtered ? SearchX : ClipboardList} title={filtered ? "لا توجد طلبات مطابقة" : "لا توجد طلبات تسجيل"} />}
          renderMobileCard={(r) => (
            <Link href={href(r)} className="block space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{r.firstName} {r.lastName}</p>
                <RegistrationStatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span dir="ltr" className="tabular-nums">{r.phone}</span>
                <span>{ageCell(r)}</span>
                <span>{formatDate(r.submittedAt)}</span>
                <RegistrationSourceBadge source={r.source} />
              </div>
            </Link>
          )}
        />
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>
      <AddRequestDialog key={adding.key} open={adding.open} onOpenChange={(open) => setAdding((p) => ({ ...p, open }))} />
    </>
  )
}

/** People the API flagged as possible duplicates: link one (no student profile yet) or confirm a new person. */
function DuplicateDialog({
  candidates,
  pending,
  error,
  onLink,
  onCreateNew,
  onCancel,
}: {
  candidates: DuplicateCandidate[]
  pending: boolean
  error?: string
  onLink: (personId: string) => void
  onCreateNew: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>يوجد شخص بنفس الاسم أو رقم الهاتف</DialogTitle>
          <DialogDescription>لا يُدمج أي شخص تلقائيًا: اربط الطلب بشخص موجود ليس له ملف طالب، أو أكّد إنشاء شخص جديد.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-xl border">
          {candidates.map((c) => (
            <li key={c.personId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-medium">{c.firstName} {c.lastName}</p>
                <p className="text-xs text-muted-foreground">
                  {c.dateOfBirth ? formatDate(c.dateOfBirth) : "تاريخ الميلاد غير معروف"}
                  {c.phone && <> · <span dir="ltr">{c.phone}</span></>}
                </p>
              </div>
              {c.studentId ? (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/admin/students/${c.studentId}`}>طالب مسجّل — عرض</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => onLink(c.personId)}>
                  ربط هذا الشخص
                </Button>
              )}
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onCancel}>{labels.common.cancel}</Button>
          <Button disabled={pending} onClick={onCreateNew}>
            {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            إنشاء شخص جديد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Review page: accept (through the student admission form) or refuse. */
export function RegistrationRequestDetails({ requestId }: { requestId: ID }) {
  return <WithLookups>{(lookups) => <RequestDetails requestId={requestId} lookups={lookups} />}</WithLookups>
}

function RequestDetails({ requestId, lookups }: { requestId: ID; lookups: Lookups }) {
  const today = todayInTunis()
  const query = useRegistrationRequest(requestId)
  const accept = useAcceptRegistration(requestId)
  const reject = useRejectRegistration(requestId)
  const [admission, setAdmission] = useState({ key: 0, open: false })
  const [refusing, setRefusing] = useState({ key: 0, open: false })
  const [reason, setReason] = useState("")
  const [duplicates, setDuplicates] = useState<{ input: AcceptInput; candidates: DuplicateCandidate[]; error?: string } | null>(null)
  const back = "/admin/registration-requests"

  if (query.isError && query.error instanceof ApiError && query.error.isNotFound)
    return <NotFoundState title="الطلب غير موجود" backHref={back} backLabel="العودة إلى الطلبات" />
  if (!query.data) return <QueryState query={query}>{null}</QueryState>

  const request = toRegistrationRequest(query.data)
  const name = `${request.firstName} ${request.lastName}`
  const age = requestAge(request, today)
  const reviewable = canReviewRequest(request)
  const isMinor = age !== undefined && age < 18

  const accepted = (linked: boolean) => {
    setDuplicates(null)
    setAdmission((p) => ({ ...p, open: false }))
    toast.success(`تم قبول ${name} وإنشاء ملف الطالب`, linked ? { description: "رُبط الطلب بشخص موجود." } : undefined)
  }
  /** Runs the acceptance; a duplicate warning opens the choice dialog instead of failing. */
  const run = async (input: AcceptInput) => {
    try {
      const result = await accept.mutateAsync(input)
      accepted(result.linkedExistingPerson)
    } catch (error) {
      if (error instanceof ApiError && error.code === "POSSIBLE_DUPLICATE_PERSON") {
        const candidates = (error.body as { candidates?: DuplicateCandidate[] } | undefined)?.candidates ?? []
        setDuplicates({ input, candidates })
        return
      }
      if (duplicates) setDuplicates({ ...duplicates, error: errorMessage(error) })
      else throw error
    }
  }
  const fromForm = (input: StudentInput): AcceptInput => ({
    groupClassId: input.groupClassId,
    registrationDate: input.registrationDate,
    person: input.person,
    guardianPhone: input.guardianPhone,
    cin: input.cin,
    photo: input.photo ?? undefined,
  })

  return (
    <>
      <Breadcrumbs className="mb-4" items={[{ label: "طلبات التسجيل", href: back }, { label: name }]} />
      <Card className="mb-6 gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <RegistrationStatusBadge status={request.status} />
              <RegistrationSourceBadge source={request.source} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{name}</h1>
          </div>
          {reviewable && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAdmission((p) => ({ key: p.key + 1, open: true }))}>
                <UserCheck />
                قبول الطلب
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  setReason("")
                  setRefusing((p) => ({ key: p.key + 1, open: true }))
                }}
              >
                <UserX />
                رفض الطلب
              </Button>
            </div>
          )}
        </div>
        <InfoList
          items={[
            { label: "الهاتف", value: <PhoneLink phone={request.phone} />, icon: Phone },
            ...(request.guardianPhone ? [{ label: "هاتف الولي", value: <PhoneLink phone={request.guardianPhone} />, icon: Phone }] : []),
            { label: request.birthDate ? "تاريخ الميلاد" : "العمر", value: request.birthDate ? `${formatDate(request.birthDate)} (${age} سنة)` : age !== undefined ? `${age} سنة` : undefined, icon: CalendarDays },
            { label: "دراسة القرآن سابقًا", value: request.hasStudiedQuranBefore ? `نعم${request.previousExperience ? ` — ${request.previousExperience}` : ""}` : "لا", icon: BookOpen },
            { label: "تاريخ الطلب", value: formatDate(request.submittedAt), icon: CalendarDays },
            ...(request.interestedProgramLabel ? [{ label: "الاهتمام المُعلن", value: request.interestedProgramLabel, icon: Globe }] : []),
            ...(request.notes ? [{ label: "معلومات إضافية", value: request.notes, icon: ClipboardList }] : []),
            ...(request.reviewedAt ? [{ label: "تاريخ المراجعة", value: formatDate(request.reviewedAt), icon: ShieldCheck }] : []),
          ]}
        />
      </Card>

      {request.status === "ACCEPTED" && (
        <Alert className="border-primary/30 bg-brand-soft/30">
          <CheckCircle2 className="text-primary" />
          <AlertTitle>تم إنشاء ملف الطالب</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{request.createdStudentName ?? "ملف الطالب"} — لا يمكن تحويل هذا الطلب مرة أخرى.</span>
            {request.createdStudentId && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/students/${request.createdStudentId}`}>عرض الطالب</Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {request.status === "REFUSED" && (
        <Alert>
          <UserX />
          <AlertTitle>تم رفض الطلب</AlertTitle>
          <AlertDescription>
            يبقى الطلب في السجل ولم يُنشأ أي ملف طالب.
            {request.rejectionReason && <> السبب: {request.rejectionReason}</>}
          </AlertDescription>
        </Alert>
      )}

      {reviewable && (
        <StudentFormSheet
          key={admission.key}
          open={admission.open}
          onOpenChange={(open) => setAdmission((p) => ({ ...p, open }))}
          lookups={lookups}
          title={`قبول ${name} وإنشاء ملف الطالب`}
          description="المعلومات المعروفة من الطلب معبّأة مسبقًا. أكمل البيانات واختر الحلقة (الفصل) التي سيدرس فيها."
          submitLabel="قبول وإنشاء الملف"
          prefill={{
            firstName: request.firstName,
            lastName: request.lastName,
            dateOfBirth: request.birthDate,
            ...(isMinor ? { guardianPhone: request.guardianPhone ?? request.phone } : { phone: request.phone, guardianPhone: request.guardianPhone }),
            registrationDate: today,
            status: "ACTIVE",
          }}
          onSave={(input) => run(fromForm(input))}
        />
      )}
      {duplicates && (
        <DuplicateDialog
          candidates={duplicates.candidates}
          pending={accept.isPending}
          error={duplicates.error}
          onCancel={() => setDuplicates(null)}
          onLink={(personId) => {
            // Linking an existing person: the request data is not used to create one
            void run({ ...duplicates.input, person: undefined, personId })
          }}
          onCreateNew={() => void run({ ...duplicates.input, confirmNewPerson: true })}
        />
      )}
      <ConfirmDialog
        key={refusing.key}
        open={refusing.open}
        onOpenChange={(open) => setRefusing((p) => ({ ...p, open }))}
        title={`رفض طلب ${name}؟`}
        description="يبقى الطلب في السجل بحالة «مرفوض» ولن يُنشأ أي ملف طالب."
        confirmLabel="رفض الطلب"
        destructive
        onConfirm={async () => {
          await reject.mutateAsync(reason.trim() || null)
          setRefusing((p) => ({ ...p, open: false }))
          toast.success("تم رفض الطلب")
        }}
      >
        <Textarea aria-label="سبب الرفض (اختياري)" placeholder="سبب الرفض (اختياري)" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </>
  )
}
