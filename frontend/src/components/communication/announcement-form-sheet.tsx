"use client"

import { useState } from "react"

import { ChoiceGroup } from "@/components/shared/choice-group"
import { FormField, FormSection, FormSheet } from "@/components/shared/form"
import { MultiSelect } from "@/components/shared/multi-select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AnnouncementDto, AnnouncementInput, PublicationMode } from "@/lib/api/announcements"
import { groupClassLabel } from "@/lib/communication"
import { todayInTunis, tunisTimeOf } from "@/lib/dates"
import type { Lookups } from "@/lib/domain"
import { labels } from "@/lib/i18n"
import type { AnnouncementAudienceType, ID } from "@/types/domain"

export interface AnnouncementFormResult {
  input: AnnouncementInput
  mode: PublicationMode
  /** Africa/Tunis wall clock "YYYY-MM-DDTHH:mm" (SCHEDULE only) */
  scheduledAt?: string
}

const AUDIENCES: AnnouncementAudienceType[] = ["EVERYONE", "TEACHERS", "STUDENTS", "SPECIFIC_GROUP_CLASSES", "SPECIFIC_BRANCHES"]
const AUDIENCE_HINT: Record<AnnouncementAudienceType, string> = {
  EVERYONE: "الطلبة والمعلمون والإدارة",
  TEACHERS: "كل المعلمين",
  STUDENTS: "كل الطلبة النشطين",
  SPECIFIC_GROUP_CLASSES: "طلبة ومعلمو فصول بعينها",
  SPECIFIC_BRANCHES: "طلبة ومعلمو فروع بعينها",
}

/**
 * Create / edit an announcement (admin). A new one is published now
 * (default), scheduled at a Tunis date and time, or saved as a draft.
 * After publication only the title, content and expiry can change.
 */
export function AnnouncementFormSheet({
  open,
  onOpenChange,
  announcement,
  lookups,
  pending,
  error,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement?: AnnouncementDto
  lookups: Lookups
  pending?: boolean
  error?: string | null
  onSave: (result: AnnouncementFormResult) => void
}) {
  const today = todayInTunis()
  const locked = announcement ? announcement.status === "PUBLISHED" || announcement.status === "ARCHIVED" : false
  const [title, setTitle] = useState(announcement?.title ?? "")
  const [content, setContent] = useState(announcement?.content ?? "")
  const [audience, setAudience] = useState<AnnouncementAudienceType>(announcement?.audience ?? "EVERYONE")
  const [classIds, setClassIds] = useState<ID[]>(announcement?.groupClasses.map((c) => c.id) ?? [])
  const [branchIds, setBranchIds] = useState<ID[]>(announcement?.branches.map((b) => b.id) ?? [])
  const [expiresAt, setExpiresAt] = useState(announcement?.expiresAt ?? "")
  const [mode, setMode] = useState<PublicationMode>("PUBLISH_NOW")
  const [scheduleDate, setScheduleDate] = useState(today)
  const [scheduleTime, setScheduleTime] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [inPast, setInPast] = useState(false)

  const scheduledAt = `${scheduleDate}T${scheduleTime}`
  const errors = {
    title: !title.trim() ? "العنوان مطلوب" : undefined,
    content: !content.trim() ? "المحتوى مطلوب" : undefined,
    classes: audience === "SPECIFIC_GROUP_CLASSES" && classIds.length === 0 ? "اختر فصلًا واحدًا على الأقل" : undefined,
    branches: audience === "SPECIFIC_BRANCHES" && branchIds.length === 0 ? "اختر فرعًا واحدًا على الأقل" : undefined,
    schedule:
      !announcement && mode === "SCHEDULE"
        ? !scheduleDate || !scheduleTime
          ? "حدّد تاريخ ووقت النشر"
          : inPast
            ? "يجب أن يكون موعد النشر في المستقبل"
            : undefined
        : undefined,
    expiresAt:
      expiresAt && expiresAt < (mode === "SCHEDULE" && !announcement ? scheduleDate : today)
        ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ النشر"
        : undefined,
  }
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)
  const submitLabel = announcement
    ? "حفظ التعديلات"
    : mode === "PUBLISH_NOW"
      ? "نشر الإعلان"
      : mode === "SCHEDULE"
        ? "جدولة النشر"
        : "حفظ كمسودة"

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={announcement ? "تعديل الإعلان" : "إعلان جديد"}
      submitLabel={submitLabel}
      pending={pending}
      error={error}
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        // "Now" is read at submit time (Africa/Tunis wall clock)
        const past = !announcement && mode === "SCHEDULE" && scheduledAt <= `${todayInTunis()}T${tunisTimeOf(Date.now())}`
        setInPast(past)
        if (pending || past || Object.values(errors).some(Boolean)) return
        onSave({
          input: {
            title: title.trim(),
            content: content.trim(),
            audience,
            groupClassIds: classIds,
            branchIds,
            expiresAt: expiresAt || null,
          },
          mode,
          scheduledAt: mode === "SCHEDULE" ? scheduledAt : undefined,
        })
      }}
    >
      <FormSection title="الإعلان" className="sm:grid-cols-1">
        <FormField id="ann-title" label="العنوان" required error={shown("title")}>
          <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={!!shown("title") || undefined} />
        </FormField>
        <FormField id="ann-content" label="المحتوى" required error={shown("content")}>
          <Textarea id="ann-content" value={content} onChange={(e) => setContent(e.target.value)} rows={5} maxLength={10000} aria-invalid={!!shown("content") || undefined} />
        </FormField>
      </FormSection>

      <FormSection
        title="الجمهور المستهدف"
        description={locked ? "لا يمكن تغيير الجمهور بعد النشر." : undefined}
        className="sm:grid-cols-1"
      >
        <ChoiceGroup
          label="الجمهور المستهدف"
          value={audience}
          onChange={(value: AnnouncementAudienceType) => !locked && setAudience(value)}
          choices={AUDIENCES.map((value) => ({ value, label: labels.announcementAudience[value], description: AUDIENCE_HINT[value] }))}
        />
        {audience === "SPECIFIC_GROUP_CLASSES" && (
          <FormField id="ann-classes" label="الفصول المستهدفة" required error={shown("classes")}>
            <MultiSelect
              id="ann-classes"
              options={lookups.groupClasses.filter((c) => c.status !== "ARCHIVED").map((c) => ({ value: c.id, label: groupClassLabel(c, lookups) }))}
              selected={classIds}
              onChange={(ids) => !locked && setClassIds(ids)}
              placeholder="اختر الفصول"
              searchPlaceholder="ابحث عن فصل…"
              countLabel={(n) => `${n} فصل مختار`}
              invalid={!!shown("classes")}
            />
          </FormField>
        )}
        {audience === "SPECIFIC_BRANCHES" && (
          <FormField id="ann-branches" label="الفروع المستهدفة" required error={shown("branches")}>
            <MultiSelect
              id="ann-branches"
              options={lookups.branches.filter((b) => b.status === "ACTIVE").map((b) => ({ value: b.id, label: b.name }))}
              selected={branchIds}
              onChange={(ids) => !locked && setBranchIds(ids)}
              placeholder="اختر الفروع"
              searchPlaceholder="ابحث عن فرع…"
              countLabel={(n) => `${n} فرع مختار`}
              invalid={!!shown("branches")}
            />
          </FormField>
        )}
      </FormSection>

      {!announcement && (
        <FormSection title="النشر" className="sm:grid-cols-1">
          <ChoiceGroup
            label="طريقة النشر"
            value={mode}
            onChange={setMode}
            choices={[
              { value: "PUBLISH_NOW", label: "نشر الآن", description: "يظهر فورًا ويُرسل إشعار إلى المعنيين." },
              { value: "SCHEDULE", label: "جدولة النشر", description: "يُنشر تلقائيًا في الموعد المحدد (توقيت تونس)." },
              { value: "DRAFT", label: "حفظ كمسودة", description: "لا يظهر لأحد ولا يُرسل أي إشعار." },
            ]}
          />
          {mode === "SCHEDULE" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="ann-schedule-date" label="تاريخ النشر" required error={shown("schedule")}>
                <Input id="ann-schedule-date" type="date" min={today} value={scheduleDate} onChange={(e) => { setScheduleDate(e.target.value); setInPast(false) }} />
              </FormField>
              <FormField id="ann-schedule-time" label="الساعة (توقيت تونس)" required>
                <Input id="ann-schedule-time" type="time" dir="ltr" value={scheduleTime} onChange={(e) => { setScheduleTime(e.target.value); setInPast(false) }} />
              </FormField>
            </div>
          )}
        </FormSection>
      )}

      <FormSection title="مدة العرض" className="sm:grid-cols-1">
        <FormField id="ann-expires" label="تاريخ الانتهاء" optional error={shown("expiresAt")} description="آخر يوم يظهر فيه الإعلان في فضاء المعلمين والطلبة.">
          <Input id="ann-expires" type="date" value={expiresAt} min={today} onChange={(e) => setExpiresAt(e.target.value)} className="sm:w-48" />
        </FormField>
      </FormSection>
    </FormSheet>
  )
}
