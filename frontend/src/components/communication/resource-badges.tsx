import {
  ExternalLink,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  File as FileIcon,
  Link2,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Resource, ResourceType } from "@/types/domain"

export const RESOURCE_TYPES: ResourceType[] = ["PDF", "IMAGE", "AUDIO", "VIDEO_LINK", "EXTERNAL_LINK", "FILE"]

/** Types backed by a selected file (the others are links). */
export const FILE_TYPES: ResourceType[] = ["PDF", "IMAGE", "AUDIO", "FILE"]

export const RESOURCE_ICON: Record<ResourceType, LucideIcon> = {
  PDF: FileText,
  IMAGE: FileImage,
  AUDIO: FileAudio,
  VIDEO_LINK: FileVideo,
  EXTERNAL_LINK: Link2,
  FILE: FileIcon,
}

/** What the student does with each type. */
const ACTION_LABEL: Record<ResourceType, string> = {
  PDF: "فتح الملف",
  IMAGE: "عرض الصورة",
  AUDIO: "استماع",
  VIDEO_LINK: "مشاهدة الفيديو",
  EXTERNAL_LINK: "فتح الرابط",
  FILE: "تحميل / فتح الملف",
}

export function ResourceTypeBadge({ type, className }: { type: ResourceType; className?: string }) {
  const Icon = RESOURCE_ICON[type]
  return (
    <Badge variant="secondary" className={cn("gap-1 font-normal", className)}>
      <Icon aria-hidden />
      {labels.resourceType[type]}
    </Badge>
  )
}

export function formatFileSize(bytes?: number) {
  if (!bytes) return undefined
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`
}

/** The resource's link: an external URL, or the stored file's URL when one exists. */
export function resourceHref(resource: Resource) {
  return resource.externalUrl ?? resource.fileUrl
}

/**
 * Opens the resource in a new tab. Seed files have metadata only (no
 * storage yet), so their action is shown disabled — never a fake URL.
 */
export function ResourceAction({ resource, size = "sm" }: { resource: Resource; size?: "sm" | "default" }) {
  const href = resourceHref(resource)
  const label = ACTION_LABEL[resource.type]
  if (!href) {
    return (
      <Button size={size} variant="outline" disabled title="الملف غير متوفر في النسخة التجريبية (لا يوجد تخزين بعد)">
        {label}
      </Button>
    )
  }
  return (
    <Button asChild size={size} variant="outline">
      <a href={href} target="_blank" rel="noopener noreferrer" download={resource.type === "FILE" ? resource.fileName : undefined}>
        <ExternalLink />
        {label}
      </a>
    </Button>
  )
}
