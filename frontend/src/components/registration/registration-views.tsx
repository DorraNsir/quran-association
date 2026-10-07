"use client"

import { BookOpen, CalendarDays, CheckCircle2, ClipboardList, Eye, Globe, Phone, Plus, SearchX, ShieldCheck, UserCheck, UserX } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { StudentFormSheet } from "@/components/students/student-form-sheet"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { EmptyState } from "@/components/shared/empty-state"
import { ALL, FilterBar, FilterSelect, matchesText, SearchInput } from "@/components/shared/filters"
import { InfoList, PhoneLink } from "@/components/shared/info-list"
import { Breadcrumbs, PageHeader } from "@/components/shared/page-header"
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
import { fullName, type Lookups } from "@/lib/domain"
import { formatDate } from "@/lib/format"
import { labels } from "@/lib/i18n"
import { canReviewRequest, requestAge } from "@/lib/registration"
import { allStudents, operations, useOperations } from "@/lib/store/operations"
import { cn } from "@/lib/utils"
import type { ID, ISODate, RegistrationRequest, RegistrationRequestStatus } from "@/types/domain"

import { useRegistrationForm } from "./registration-form"
import { getCurrentAcademicYear } from "@/lib/academic-years"
import { useAdminDate } from "@/lib/store/settings"

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

/**
 * Public pre-registration — creates a PENDING request only (no student, no
 * account, no class, no payment). `interestId` (an announced upcoming group)
 * is recorded as interest; the class stays an admission decision.
 */
export function PublicRegistrationForm({ today, interestId }: { today: ISODate; interestId?: string }) {
  const form = useRegistrationForm(today)
  const [sent, setSent] = useState(false)
  const { publicGroups, siteSettings } = useOperations()
  const interest = interestId ? publicGroups.find((g) => g.id === interestId && g.isPublished && g.registrationOpen) : undefined

  if (!siteSettings.registrationEnabled) {
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
          طلب تسجيل في: <span className="font-semibold">{interest.titleAr}</span> — تحدّد الإدارة الحلقة المناسبة عند قبول الطلب.
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
              const fields = form.collect()
              if (!fields) return
              operations.submitRegistrationRequest(
                { ...fields, interestedGroupId: interest?.groupId, interestedProgramLabel: interest?.titleAr },
                "PUBLIC_WEBSITE",
                today
              )
              setSent(true)
            }}
          >
            {form.fields("public", "self")}
            <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base">إرسال طلب التسجيل</Button>
          </form>
        )}
      </Card>
    </div>
  )
}

/** Admin entry of a request (visit, phone call…): same entity, source ADMIN, still PENDING. */
function AddRequestDialog({ open, onOpenChange, today }: { open: boolean; onOpenChange: (open: boolean) => void; today: ISODate }) {
  const form = useRegistrationForm(today)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const fields = form.collect()
            if (!fields) return
            operations.submitRegistrationRequest(fields, "ADMIN", today)
            onOpenChange(false)
            toast.success("تمت إضافة طلب التسجيل", { description: "الحالة: قيد الانتظار — لم يُنشأ ملف طالب بعد." })
          }}
        >
          <DialogHeader>
            <DialogTitle>إضافة طلب تسجيل</DialogTitle>
            <DialogDescription>لمن حضر إلى الجمعية أو اتصل هاتفيًا. يُراجَع الطلب ثم يُقبل أو يُرفض.</DialogDescription>
          </DialogHeader>
          {form.fields("admin-req", "applicant")}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{labels.common.cancel}</Button>
            <Button type="submit">
              <Plus />
              إضافة الطلب
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RegistrationRequestsView({ today }: { today: ISODate }) {
  const adminDate = useAdminDate()
  const { registrationRequests } = useOperations()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState(ALL)
  const [source, setSource] = useState(ALL)
  const [adding, setAdding] = useState({ key: 0, open: false })
  const list = [...registrationRequests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id))
  const shown = list.filter(
    (r) =>
      (!query.trim() || matchesText(`${r.firstName} ${r.lastName} ${r.phone}`, query)) &&
      (status === ALL || r.status === status) &&
      (source === ALL || r.source === source)
  )
  const pending = list.filter((r) => r.status === "PENDING").length
  const href = (r: RegistrationRequest) => `/admin/registration-requests/${r.id}`
  const ageCell = (r: RegistrationRequest) => {
    const age = requestAge(r, today)
    return age === undefined ? "—" : `${age} سنة`
  }

  const columns: Column<RegistrationRequest>[] = [
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
        hasActiveFilters={Boolean(query) || status !== ALL || source !== ALL}
        onReset={() => {
          setQuery("")
          setStatus(ALL)
          setSource(ALL)
        }}
        resultLabel={`${shown.length} طلب`}
        search={<SearchInput value={query} onChange={setQuery} label="البحث في الطلبات" placeholder="ابحث بالاسم أو الهاتف…" />}
      >
        <FilterSelect label="الحالة" allLabel="كل الحالات" value={status} onValueChange={setStatus}
          options={(["PENDING", "ACCEPTED", "REFUSED"] as const).map((s) => ({ value: s, label: labels.registrationStatus[s] }))} />
        <FilterSelect label="المصدر" allLabel="كل المصادر" value={source} onValueChange={setSource}
          options={(["PUBLIC_WEBSITE", "ADMIN"] as const).map((s) => ({ value: s, label: labels.registrationSource[s] }))} />
      </FilterBar>
      <DataTable
        key={`${query}|${status}|${source}`}
        caption="طلبات التسجيل"
        columns={columns}
        rows={shown}
        getRowId={(r) => r.id}
        emptyState={<EmptyState icon={list.length === 0 ? ClipboardList : SearchX} title={list.length === 0 ? "لا توجد طلبات تسجيل" : "لا توجد طلبات مطابقة"} />}
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
      <AddRequestDialog key={adding.key} open={adding.open} onOpenChange={(open) => setAdding((p) => ({ ...p, open }))} today={today} />
    </>
  )
}

/** Review: accept (through the student admission form) or refuse. */
export function RegistrationRequestDetails({
  requestId,
  reviewerId,
  lookups,
  today,
}: {
  requestId: ID
  reviewerId: ID
  lookups: Lookups
  today: ISODate
}) {
  const state = useOperations()
  // Obligations of an admitted student belong to the CURRENT academic year (set in /admin/settings)
  const academicYearId = getCurrentAcademicYear(state.academicYears).id
  const [admission, setAdmission] = useState({ key: 0, open: false })
  const [refusing, setRefusing] = useState(false)
  const request = state.registrationRequests.find((r) => r.id === requestId)
  const back = "/admin/registration-requests"

  if (!request) {
    return (
      <Card className="p-0">
        <EmptyState icon={ClipboardList} title="الطلب غير موجود"
          action={<Button asChild variant="outline"><Link href={back}>العودة إلى الطلبات</Link></Button>} />
      </Card>
    )
  }
  const name = `${request.firstName} ${request.lastName}`
  const age = requestAge(request, today)
  const student = request.createdStudentId ? allStudents(state).find((s) => s.id === request.createdStudentId) : undefined
  const reviewable = canReviewRequest(request)
  const isMinor = age !== undefined && age < 18

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
              <Button variant="outline" className="text-destructive" onClick={() => setRefusing(true)}>
                <UserX />
                رفض الطلب
              </Button>
            </div>
          )}
        </div>
        <InfoList
          items={[
            { label: "الهاتف", value: <PhoneLink phone={request.phone} />, icon: Phone },
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
            <span>{student ? fullName(student) : "ملف الطالب"} — لا يمكن تحويل هذا الطلب مرة أخرى.</span>
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
          <AlertDescription>يبقى الطلب في السجل ولم يُنشأ أي ملف طالب.</AlertDescription>
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
            ...(isMinor ? { guardianPhone: request.phone } : { phone: request.phone }),
            registrationDate: today,
            status: "ACTIVE",
          }}
          onSave={(saved) => {
            const ok = operations.admitRegistrationRequest(request.id, saved, reviewerId, today, academicYearId)
            setAdmission((p) => ({ ...p, open: false }))
            if (ok) toast.success(`تم قبول ${name} وإنشاء ملف الطالب`, { description: labels.common.mockNotice })
            else toast.error("لا يمكن قبول هذا الطلب")
          }}
        />
      )}
      <ConfirmDialog
        open={refusing}
        onOpenChange={setRefusing}
        title={`رفض طلب ${name}؟`}
        description="يبقى الطلب في السجل بحالة «مرفوض» ولن يُنشأ أي ملف طالب."
        confirmLabel="رفض الطلب"
        destructive
        onConfirm={() => {
          operations.refuseRegistrationRequest(request.id, reviewerId, today)
          setRefusing(false)
          toast.success("تم رفض الطلب")
        }}
      />
    </>
  )
}
