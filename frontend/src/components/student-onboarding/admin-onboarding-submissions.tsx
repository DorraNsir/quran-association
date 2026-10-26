"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Check, ExternalLink, Inbox, Link2, Pencil, UserPlus, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters"
import { FormSection } from "@/components/shared/form"
import { FormErrorAlert } from "@/components/shared/form-error-alert"
import { Pager } from "@/components/shared/pager"
import { QueryState } from "@/components/shared/query-state"
import { WithLookups } from "@/components/shared/with-lookups"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useFormState } from "@/hooks/use-form-state"
import { api, fetchPrivateBlob } from "@/lib/api/client"
import { ApiError, errorMessage } from "@/lib/api/errors"
import {
  onboardingKeys,
  onboardingPhotoPath,
  schoolYearStart,
  useOnboardingSubmission,
  useOnboardingSubmissions,
  useReviewOnboardingSubmission,
  type OnboardingSubmission,
  type OnboardingSubmissionDetail,
  type PossibleMatch,
  type SubmissionStatus,
} from "@/lib/api/student-onboarding"
import { todayInTunis } from "@/lib/dates"
import { describeClass, fullName, indexLookups, type Lookups } from "@/lib/domain"
import { formatDate, formatDateTime } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { usePlatformSettings } from "@/lib/store/settings"
import { cn } from "@/lib/utils"

import { OnboardingShell } from "./admin-onboarding-links"
import { StudentFields, toFieldValues, toPayload, validateFields } from "./onboarding-fields"

const STATUS_LABEL: Record<SubmissionStatus, string> = { PENDING: "بانتظار المراجعة", APPROVED: "مقبول", REJECTED: "مرفوض" }
const STATUS_STYLE: Record<SubmissionStatus, string> = {
  PENDING: "bg-warning-soft text-warning",
  APPROVED: "bg-brand-soft text-brand-soft-foreground",
  REJECTED: "bg-muted text-muted-foreground",
}
const REASON_LABEL: Record<PossibleMatch["reasons"][number], string> = {
  NAME: "نفس الاسم واللقب",
  BIRTH_DATE: "نفس تاريخ الولادة",
  GUARDIAN_PHONE: "نفس هاتف الولي",
  PHONE: "نفس الهاتف",
}

const StatusBadge = ({ status }: { status: SubmissionStatus }) => (
  <Badge variant="outline" className={cn("border-transparent", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</Badge>
)

export function OnboardingSubmissionsScreen() {
  return <WithLookups>{(lookups) => <SubmissionsView lookups={lookups} />}</WithLookups>
}

function SubmissionsView({ lookups }: { lookups: Lookups }) {
  const pageSize = usePlatformSettings().defaultPageSize
  const indexes = indexLookups(lookups)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<string>("PENDING")
  const [branchId, setBranchId] = useState(ALL)
  const [groupId, setGroupId] = useState(ALL)
  const [classId, setClassId] = useState(ALL)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const reset = <T,>(set: (v: T) => void) => (v: T) => (set(v), setPage(1))

  const list = useOnboardingSubmissions(
    {
      q: q.trim() || undefined,
      status: status === ALL ? undefined : (status as SubmissionStatus),
      branchId: branchId === ALL ? undefined : branchId,
      groupId: groupId === ALL ? undefined : groupId,
      groupClassId: classId === ALL ? undefined : classId,
      from: from || undefined,
      to: to || undefined,
    },
    page,
    pageSize
  )
  const classes = lookups.groupClasses.filter((c) => (branchId === ALL || c.branchId === branchId) && (groupId === ALL || c.groupId === groupId))
  const hasFilters = Boolean(q || from || to) || status !== "PENDING" || [branchId, groupId, classId].some((v) => v !== ALL)

  const columns: Column<OnboardingSubmission>[] = [
    {
      id: "name",
      header: "الطالب",
      cell: (s) => (
        <button type="button" className="text-start font-medium hover:text-primary" onClick={() => setOpenId(s.id)}>
          {s.firstName} {s.lastName}
        </button>
      ),
    },
    { id: "branch", header: "الفرع", className: "hidden md:table-cell", cell: (s) => s.groupClass.branch.name },
    { id: "group", header: "المجموعة", cell: (s) => s.groupClass.group.name },
    { id: "class", header: "القسم", className: "hidden lg:table-cell", cell: (s) => (s.groupClass.supervisorName ? `قسم ${s.groupClass.supervisorName}` : "—") },
    { id: "date", header: "تاريخ الإرسال", cell: (s) => <span className="inline-block text-sm tabular-nums">{formatDateTime(s.createdAt)}</span> },
    { id: "status", header: "الحالة", cell: (s) => <StatusBadge status={s.status} /> },
    {
      id: "action",
      header: <span className="sr-only">إجراءات</span>,
      cell: (s) => (
        <Button size="sm" variant={s.status === "PENDING" ? "default" : "outline"} onClick={() => setOpenId(s.id)}>
          {s.status === "PENDING" ? "مراجعة" : "عرض"}
        </Button>
      ),
    },
  ]

  return (
    <OnboardingShell>
      <FilterBar
        hasActiveFilters={hasFilters}
        onReset={() => {
          setQ("")
          setStatus("PENDING")
          setBranchId(ALL)
          setGroupId(ALL)
          setClassId(ALL)
          setFrom("")
          setTo("")
          setPage(1)
        }}
        resultLabel={`${list.data?.meta.total ?? 0} طلب`}
        search={<SearchInput value={q} onChange={reset(setQ)} label="البحث" placeholder="الاسم أو رقم الهاتف…" />}
      >
        <FilterSelect label="الحالة" allLabel="كل الحالات" value={status} onValueChange={reset(setStatus)}
          options={(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
        <FilterSelect label="الفرع" allLabel="كل الفروع" value={branchId} onValueChange={(v) => (setBranchId(v), setClassId(ALL), setPage(1))}
          options={lookups.branches.map((b) => ({ value: b.id, label: b.name }))} />
        <FilterSelect label="المجموعة" allLabel="كل المجموعات" value={groupId} onValueChange={(v) => (setGroupId(v), setClassId(ALL), setPage(1))}
          options={lookups.groups.map((g) => ({ value: g.id, label: g.name }))} />
        <FilterSelect label="القسم" allLabel="كل الأقسام" value={classId} onValueChange={reset(setClassId)}
          options={classes.map((c) => {
            const v = describeClass(c, indexes)
            return { value: c.id, label: `${v.group?.name ?? ""} — ${v.supervisor ? fullName(v.supervisor) : ""}` }
          })} />
        <Input type="date" dir="ltr" aria-label="من تاريخ" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className="w-full sm:w-40" />
        <Input type="date" dir="ltr" aria-label="إلى تاريخ" value={to} onChange={(e) => reset(setTo)(e.target.value)} className="w-full sm:w-40" />
      </FilterBar>

      <QueryState query={list}>
        <DataTable
          caption="طلبات الاستكمال"
          columns={columns}
          rows={list.data?.data ?? []}
          getRowId={(s) => s.id}
          emptyState={<EmptyState icon={Inbox} title="لا توجد طلبات" description="تظهر هنا الاستمارات المرسلة عبر روابط الاستكمال." />}
        />
        <Pager page={page} totalPages={list.data?.meta.totalPages ?? 1} onPage={setPage} />
      </QueryState>

      <ReviewSheet id={openId} onClose={() => setOpenId(null)} />
    </OnboardingShell>
  )
}

/** One submission: everything submitted, possible duplicates and the decisions. */
export function ReviewSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useOnboardingSubmission(id)
  const sub = query.data
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="left" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{sub ? `${sub.firstName} ${sub.lastName}` : "طلب استكمال"}</SheetTitle>
          {sub && (
            <SheetDescription>
              {sub.groupClass.group.name} — {sub.groupClass.branch.name}
              {sub.groupClass.supervisorName ? ` (قسم ${sub.groupClass.supervisorName})` : ""}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="p-4">
          <QueryState query={query}>{sub && <Review key={`${sub.id}-${sub.version}`} sub={sub} onDone={onClose} />}</QueryState>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Review({ sub, onDone }: { sub: OnboardingSubmissionDetail; onDone: () => void }) {
  const review = useReviewOnboardingSubmission()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const [linkTo, setLinkTo] = useState<{ id: string; name: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  // The student's registration date when approved (default: start of the school year)
  const [registrationDate, setRegistrationDate] = useState(() => schoolYearStart(todayInTunis()))
  const pending = sub.status === "PENDING"
  const approve = (confirmNoDuplicate?: boolean) =>
    run(
      { kind: "approve", id: sub.id, version: sub.version, registrationDate: registrationDate || undefined, confirmNoDuplicate },
      "تم قبول الطلب وإضافة الطالب"
    )

  async function run(action: Parameters<typeof review.mutateAsync>[0], success: string) {
    try {
      await review.mutateAsync(action)
      toast.success(success)
      if (action.kind !== "edit") onDone()
    } catch (error) {
      toast.error(errorMessage(error))
      // Decided / edited elsewhere, or a new possible duplicate: show the current state
      if (error instanceof ApiError && error.status === 409) void queryClient.invalidateQueries({ queryKey: onboardingKeys.all })
    }
  }

  if (editing) return <EditForm sub={sub} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />

  const rows: [string, React.ReactNode][] = [
    ["الاسم واللقب", `${sub.firstName} ${sub.lastName}`],
    ["الجنس", labels.gender[sub.gender]],
    ["تاريخ الولادة", formatDate(sub.dateOfBirth)],
    ["رقم بطاقة التعريف", sub.cin ?? "—"],
    ["هاتف الطالب", sub.phone ? <span dir="ltr">{sub.phone}</span> : "—"],
    ["هاتف الولي", sub.guardianPhone ? <span dir="ltr">{sub.guardianPhone}</span> : "—"],
    ["العنوان", sub.address],
    ["أرسلها", sub.submittedBy === "GUARDIAN" ? "الولي" : "الطالب"],
    ["تاريخ الإرسال", <span key="d">{formatDateTime(sub.createdAt)}</span>],
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        {sub.hasPhoto && <SubmissionPhoto id={sub.id} name={`${sub.firstName} ${sub.lastName}`} />}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={sub.status} />
          {sub.edited && <Badge variant="secondary">عدّلت الإدارة البيانات</Badge>}
          {!sub.hasPhoto && <Badge variant="outline" className="text-muted-foreground">بدون صورة</Badge>}
        </div>
      </div>

      {pending && sub.possibleMatches.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>قد يكون هذا الطالب مسجلاً مسبقاً في المنظومة.</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-2">
              {sub.possibleMatches.map((m) => (
                <li key={m.studentId} className="rounded-lg border bg-background p-2 text-foreground">
                  <p className="font-medium">{m.firstName} {m.lastName}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.dateOfBirth ? formatDate(m.dateOfBirth) : "—"} · {m.groupClassLabel ?? "بدون قسم"}
                    {m.guardianPhone ? <> · <span dir="ltr">{m.guardianPhone}</span></> : null}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.reasons.map((r) => <Badge key={r} variant="outline" className="text-[0.7rem]">{REASON_LABEL[r]}</Badge>)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/students/${m.studentId}`} target="_blank">
                        <ExternalLink />
                        عرض الطالب الموجود
                      </Link>
                    </Button>
                    <Button size="sm" onClick={() => setLinkTo({ id: m.studentId, name: `${m.firstName} ${m.lastName}` })}>
                      <Link2 />
                      ربط بالطالب الموجود
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm break-words [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>

      {sub.edited && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">البيانات كما أُرسلت أصلًا</summary>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(sub.originalData)
              .filter(([k]) => k !== "submittedBy")
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{ORIGINAL_LABEL[k] ?? k}</dt>
                  <dd className="break-words">{v === null || v === "" ? "—" : String(k === "gender" ? labels.gender[v as "MALE"] : v)}</dd>
                </div>
              ))}
          </dl>
        </details>
      )}

      {sub.status === "APPROVED" && sub.approvedStudentId && (
        <Button asChild variant="outline">
          <Link href={`/admin/students/${sub.approvedStudentId}`}>
            <ExternalLink />
            {sub.linkedExisting ? "عرض الطالب المرتبط" : "عرض الطالب المضاف"}
          </Link>
        </Button>
      )}
      {sub.status === "REJECTED" && <p className="text-sm text-muted-foreground">سبب الرفض: {sub.rejectionReason ?? "—"}</p>}

      {pending && (
        <div className="space-y-1.5 border-t pt-4">
          <Label htmlFor={`ob-reg-${sub.id}`}>تاريخ التسجيل</Label>
          <Input
            id={`ob-reg-${sub.id}`}
            type="date"
            dir="ltr"
            max={todayInTunis()}
            value={registrationDate}
            onChange={(e) => setRegistrationDate(e.target.value)}
            className="w-full sm:w-48"
          />
          <p className="text-xs text-muted-foreground">يُعتمد عند «قبول وإضافة الطالب» — افتراضيًا بداية السنة الدراسية (1 سبتمبر).</p>
        </div>
      )}
      {pending && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={review.isPending}
            onClick={() => (sub.possibleMatches.length > 0 ? setConfirmCreate(true) : approve())}
          >
            <UserPlus />
            قبول وإضافة الطالب
          </Button>
          <Button variant="outline" onClick={() => setSearching(true)}>
            <Link2 />
            ربط بطالب موجود
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil />
            تعديل البيانات
          </Button>
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRejecting(true)}>
            <X />
            رفض الطلب
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmCreate}
        onOpenChange={setConfirmCreate}
        title="إنشاء طالب جديد رغم وجود تشابه؟"
        description="تأكّد أن هذا الطلب لا يخص أحد الطلبة المعروضين أعلاه (قد يشترك الإخوة في هاتف الولي). سيُضاف طالب جديد في قسم الرابط."
        confirmLabel="إنشاء طالب جديد بعد التأكيد"
        onConfirm={() => approve(true)}
      />
      <ConfirmDialog
        open={linkTo !== null}
        onOpenChange={(open) => !open && setLinkTo(null)}
        title={`ربط الطلب بـ ${linkTo?.name ?? ""}؟`}
        description="يُعتبر الطلب خاصًا بهذا الطالب: يُلحق بقسم الرابط وفق قواعد النقل المعتادة، ولا تُستبدل بياناته الشخصية الحالية."
        confirmLabel="ربط بالطالب الموجود"
        onConfirm={async () => linkTo && run({ kind: "link", id: sub.id, version: sub.version, studentId: linkTo.id }, "تم ربط الطلب بالطالب الموجود")}
      />
      {searching && (
        <StudentSearchDialog
          onClose={() => setSearching(false)}
          onPick={(s) => {
            setSearching(false)
            setLinkTo(s)
          }}
        />
      )}
      {rejecting && (
        <RejectDialog
          pending={review.isPending}
          onClose={() => setRejecting(false)}
          onConfirm={(reason) => run({ kind: "reject", id: sub.id, version: sub.version, reason: reason || undefined }, "تم رفض الطلب")}
        />
      )}
    </div>
  )
}

/** The submitted photo — fetched with the admin's token, kept in memory only. */
function SubmissionPhoto({ id, name }: { id: string; name: string }) {
  const blob = useQuery({
    queryKey: [...onboardingKeys.submission(id), "photo"],
    queryFn: ({ signal }) => fetchPrivateBlob(onboardingPhotoPath(id), signal),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const src = useMemo(() => (blob.data ? URL.createObjectURL(blob.data) : null), [blob.data])
  useEffect(() => () => {
    if (src) URL.revokeObjectURL(src)
  }, [src])
  if (blob.isError) return null
  if (!src) return <div className="size-24 shrink-0 animate-pulse rounded-xl bg-muted" aria-hidden />
  return (
    <a href={src} target="_blank" rel="noreferrer" className="shrink-0" title="فتح الصورة">
      {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob: URL, nothing for next/image to optimize */}
      <img src={src} alt={`صورة ${name}`} className="size-24 rounded-xl border object-cover" />
    </a>
  )
}

const ORIGINAL_LABEL: Record<string, string> = {
  firstName: "الاسم",
  lastName: "اللقب",
  gender: "الجنس",
  dateOfBirth: "تاريخ الولادة",
  address: "العنوان",
  phone: "هاتف الطالب",
  email: "البريد الإلكتروني",
  guardianPhone: "هاتف الولي",
  cin: "رقم بطاقة التعريف",
}

/** «تعديل البيانات» before approval: the student form's own fields and rules. */
function EditForm({ sub, onCancel, onSaved }: { sub: OnboardingSubmissionDetail; onCancel: () => void; onSaved: () => void }) {
  const review = useReviewOnboardingSubmission()
  const form = useFormState(`onboarding-edit-${sub.id}`, toFieldValues(sub), validateFields)
  const submit = form.handleSubmit(async (v) => {
    await review.mutateAsync({ kind: "edit", id: sub.id, version: sub.version, fields: toPayload(v) })
    toast.success("تم حفظ التعديلات")
    onSaved()
  })
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormSection title="تعديل البيانات" description="تبقى البيانات المرسلة أصلًا محفوظة للاطلاع.">
        <StudentFields form={form} />
      </FormSection>
      {form.serverError && <FormErrorAlert message={form.serverError} />}
      <div className="flex gap-2">
        <Button type="submit" disabled={form.pending}>
          <Check />
          حفظ التعديلات
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>إلغاء</Button>
      </div>
    </form>
  )
}

/** Pick an existing student by name / phone (admin students API). */
function StudentSearchDialog({ onClose, onPick }: { onClose: () => void; onPick: (s: { id: string; name: string }) => void }) {
  const [search, setSearch] = useState("")
  const results = useQuery({
    queryKey: ["students", "onboarding-search", search],
    queryFn: ({ signal }) =>
      api<{ data: { id: string; person: { firstName: string; lastName: string; dateOfBirth: string | null }; guardianPhone: string | null }[] }>(
        "/admin/students",
        { query: { search, pageSize: 10 }, signal }
      ),
    enabled: search.trim().length >= 2,
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ربط بطالب موجود</DialogTitle>
          <DialogDescription>ابحث عن الطالب بالاسم أو اللقب.</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم الطالب…" aria-label="البحث عن طالب" />
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {(results.data?.data ?? []).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-start hover:bg-muted"
                onClick={() => onPick({ id: s.id, name: `${s.person.firstName} ${s.person.lastName}` })}
              >
                <span className="block font-medium">{s.person.firstName} {s.person.lastName}</span>
                <span className="block text-xs text-muted-foreground">
                  {s.person.dateOfBirth ? formatDate(s.person.dateOfBirth) : "—"}
                  {s.guardianPhone ? <> · <span dir="ltr">{s.guardianPhone}</span></> : null}
                </span>
              </button>
            </li>
          ))}
          {search.trim().length >= 2 && results.data?.data.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">لا توجد نتائج</li>}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ pending, onClose, onConfirm }: { pending: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("")
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>رفض الطلب</DialogTitle>
          <DialogDescription>لن يُضاف أي طالب. يبقى الطلب محفوظًا بحالة «مرفوض».</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="ob-reject">سبب الرفض (اختياري)</Label>
          <Textarea id="ob-reject" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="destructive" disabled={pending} onClick={() => onConfirm(reason.trim())}>رفض الطلب</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
