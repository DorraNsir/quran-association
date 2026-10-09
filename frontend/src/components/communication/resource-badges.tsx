"use client"

import {
  ExternalLink,
  Loader2,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  File as FileIcon,
  Link2,
  type LucideIcon,
} from "lucide-react"

import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api/errors"
import { openPrivateFile, type ResourceView } from "@/lib/api/resources"
import { labels } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ResourceType } from "@/types/domain"

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

/**
 * Opens the resource: an external link directly, an uploaded file through
 * an authenticated fetch (the file is private — never a public URL).
 */
export function ResourceAction({ resource, size = "sm" }: { resource: ResourceView; size?: "sm" | "default" }) {
  const [pending, setPending] = useState(false)
  const label = ACTION_LABEL[resource.type]
  if (resource.externalUrl) {
    return (
      <Button asChild size={size} variant="outline">
        <a href={resource.externalUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink />
          {label}
        </a>
      </Button>
    )
  }
  const file = resource.file
  if (!file) {
    return (
      <Button size={size} variant="outline" disabled title="لا يوجد ملف مرفق">
        {label}
      </Button>
    )
  }
  return (
    <Button
      size={size}
      variant="outline"
      disabled={pending}
      onClick={() => {
        setPending(true)
        openPrivateFile(file, resource.type === "FILE")
          .catch((error: unknown) => toast.error(errorMessage(error)))
          .finally(() => setPending(false))
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
      {label}
    </Button>
  )
}
