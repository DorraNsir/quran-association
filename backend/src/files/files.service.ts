import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthPrincipal } from '../auth/auth.types.js';
import { toDbDate } from '../common/dates.js';
import { platformToday } from '../common/platform-clock.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { Prisma } from '../generated/prisma/client.js';
import { FilePurpose, Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StudentAccessService } from '../student-space/student-access.service.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';
import {
  studentResourceWhere,
  teacherResourceWhere,
} from '../communication/audience.js';
import { ADMIN_MANAGED, PURPOSE_KINDS } from './file-rules.js';
import {
  type DetectedType,
  detectFileType,
  extensionOf,
  type FileKind,
  sanitizeFileName,
  SIGNATURE_BYTES,
} from './file-signature.js';
import {
  STORAGE_DRIVER,
  type StorageDriver,
} from './storage/storage-driver.js';

type Tx = Prisma.TransactionClient;

/** The subset of a multer file this service needs (disk storage). */
export interface IncomingFile {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface StoredFileInfo {
  id: string;
  purpose: FilePurpose;
  mimeType: string;
  size: number;
  originalName: string;
  createdAt: Date;
  /** Authenticated download path (the bytes are never public by default) */
  url: string;
}

/** Every column that references a stored file: the source of truth for "is it used?". */
export const FILE_REFERENCES: { table: string; column: string }[] = [
  { table: 'association_settings', column: 'logoFileId' },
  { table: 'persons', column: 'photoFileId' },
  { table: 'resources', column: 'fileId' },
  { table: 'hero_slides', column: 'imageFileId' },
  { table: 'public_programs', column: 'imageFileId' },
  { table: 'public_group_listings', column: 'imageFileId' },
  { table: 'public_events', column: 'imageFileId' },
  { table: 'achievements', column: 'imageFileId' },
  { table: 'news_articles', column: 'coverImageFileId' },
  { table: 'gallery_images', column: 'imageFileId' },
  { table: 'quran_graduates', column: 'photoFileId' },
  { table: 'administration_members', column: 'photoFileId' },
];

const UNREFERENCED = Prisma.raw(
  FILE_REFERENCES.map(
    (r) =>
      `NOT EXISTS (SELECT 1 FROM "${r.table}" r WHERE r."${r.column}" = f.id)`,
  ).join(' AND '),
);

/** Client MIME spellings accepted as the same type as the detected one. */
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
};

export const fileNotFound = () =>
  new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'الملف غير موجود' });

export const privateFileUrl = (id: string) => `/api/files/${id}`;
export const publicFileUrl = (id: string) => `/api/public/files/${id}`;

/** Who attaches a file to an entity. */
export interface AttachActor {
  userId: string;
  isAdmin: boolean;
}

/**
 * Shared file storage service (one for the whole platform). Upload:
 * temporary file → content-type detection (signature) → per-type size limit
 * → SHA-256 → committed under a random key → metadata row. The database row
 * is written only after the bytes are safely stored; if it fails, the bytes
 * are removed (compensation — filesystem writes are NOT transactional).
 * Files are private until an authorized entity mutation attaches them.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly limits: Record<FileKind, number>;
  readonly retentionHours: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    private readonly teacherAccess: TeacherAccessService,
    private readonly studentAccess: StudentAccessService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.limits = {
      IMAGE: config.get('FILE_MAX_IMAGE_BYTES', { infer: true }),
      PDF: config.get('FILE_MAX_PDF_BYTES', { infer: true }),
      AUDIO: config.get('FILE_MAX_AUDIO_BYTES', { infer: true }),
    };
    this.retentionHours = config.get('FILE_UNREFERENCED_RETENTION_HOURS', {
      infer: true,
    });
  }

  /** The largest limit: what multer may receive before the per-type check. */
  get maxUploadBytes() {
    return Math.max(...Object.values(this.limits));
  }

  limitsInfo() {
    return { ...this.limits };
  }

  /* ------------------------------ upload ------------------------------ */

  async upload(
    file: IncomingFile | undefined,
    purpose: FilePurpose,
    groupClassId: string | undefined,
    userId: string,
  ): Promise<StoredFileInfo> {
    if (!file)
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'أرفق ملفًا في الحقل file',
      });
    try {
      const detected = await this.inspect(file, purpose);
      const checksum = await sha256(file.path);
      const key = newStorageKey();
      await this.storage.commit(file.path, key);
      try {
        const row = await this.prisma.storedFile.create({
          data: {
            storageKey: key,
            purpose,
            mimeType: detected.mimeType,
            size: file.size,
            checksum,
            originalName: sanitizeFileName(file.originalname),
            groupClassId: groupClassId ?? null,
            uploadedByUserId: userId,
          },
        });
        return this.info(row);
      } catch (error) {
        // Compensation: no database row → no stored bytes left behind
        await this.storage.remove(key);
        throw error;
      }
    } finally {
      await this.storage.discard(file.path);
    }
  }

  /** Type from the CONTENT; declared MIME and extension must agree; per-type size limit. */
  private async inspect(
    file: IncomingFile,
    purpose: FilePurpose,
  ): Promise<DetectedType> {
    const detected = detectFileType(await readHead(file.path));
    if (!detected || !PURPOSE_KINDS[purpose].includes(detected.kind)) {
      throw new BadRequestException({
        code: 'FILE_TYPE_NOT_ALLOWED',
        message: 'نوع الملف غير مسموح به لهذا الاستعمال',
      });
    }
    const declared = MIME_ALIASES[file.mimetype] ?? file.mimetype;
    const extension = extensionOf(file.originalname);
    if (
      declared !== detected.mimeType ||
      (extension && !detected.extensions.includes(extension))
    ) {
      throw new BadRequestException({
        code: 'FILE_TYPE_MISMATCH',
        message: 'محتوى الملف لا يطابق نوعه المعلن أو امتداده',
      });
    }
    if (file.size <= 0 || file.size > this.limits[detected.kind]) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: `حجم الملف يتجاوز الحد المسموح (${Math.floor(this.limits[detected.kind] / 1024 / 1024)} م.ب)`,
      });
    }
    return detected;
  }

  private info(row: {
    id: string;
    purpose: FilePurpose;
    mimeType: string;
    size: number;
    originalName: string;
    createdAt: Date;
  }): StoredFileInfo {
    return {
      id: row.id,
      purpose: row.purpose,
      mimeType: row.mimeType,
      size: row.size,
      originalName: row.originalName,
      createdAt: row.createdAt,
      url: privateFileUrl(row.id),
    };
  }

  /* ------------------------------ attachment ------------------------------ */

  /**
   * Validates that `actor` may attach `fileId` for `purpose`, inside the
   * attaching transaction. The row is locked FOR KEY SHARE so the cleanup
   * cannot delete it before the reference is committed. Someone else's
   * file looks missing (404): knowing an id grants nothing. ADMINs may
   * attach any admin-managed file; others only their own uploads.
   */
  async assertAttachable(
    tx: Tx,
    fileId: string,
    purpose: FilePurpose,
    actor: AttachActor,
    options: {
      kinds?: FileKind[];
      mimeTypes?: string[];
      groupClassIds?: string[];
    } = {},
  ) {
    const [file] = await tx.$queryRaw<
      {
        id: string;
        purpose: FilePurpose;
        mimeType: string;
        uploadedByUserId: string;
        groupClassId: string | null;
      }[]
    >`SELECT id, purpose, "mimeType", "uploadedByUserId", "groupClassId"
      FROM stored_files WHERE id = ${fileId}::uuid FOR KEY SHARE`;
    if (!file) throw fileNotFound();
    const mayUse =
      file.uploadedByUserId === actor.userId ||
      (actor.isAdmin && ADMIN_MANAGED.includes(file.purpose));
    if (!mayUse) throw fileNotFound();
    if (file.purpose !== purpose) {
      throw new BadRequestException({
        code: 'FILE_PURPOSE_MISMATCH',
        message: 'هذا الملف مرفوع لاستعمال آخر',
      });
    }
    const kind = detectKind(file.mimeType);
    if (
      (options.kinds && !options.kinds.includes(kind)) ||
      (options.mimeTypes && !options.mimeTypes.includes(file.mimeType))
    ) {
      throw new BadRequestException({
        code: 'FILE_TYPE_NOT_ALLOWED',
        message: 'نوع الملف لا يناسب هذا المحتوى',
      });
    }
    // A teacher's upload was authorized for ONE class: it may only reach that class
    if (
      !actor.isAdmin &&
      file.groupClassId &&
      options.groupClassIds &&
      !options.groupClassIds.includes(file.groupClassId)
    ) {
      throw new ForbiddenException({
        code: 'FILE_CLASS_MISMATCH',
        message: 'هذا الملف مرفوع لقسم آخر',
      });
    }
    return file;
  }

  /* ------------------------------ access ------------------------------ */

  /**
   * Public eligibility: a CMS image / logo referenced by at least ONE
   * currently public item (active slide, published program/listing/event/
   * achievement/gallery image/board member, published news up to today,
   * published graduate with consent, the association logo). Unattached
   * files, profile photos and resources are never public.
   */
  async isPublic(fileId: string): Promise<boolean> {
    const today = toDbDate(await platformToday(this.prisma));
    const [row] = await this.prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM stored_files f
        WHERE f.id = ${fileId}::uuid
          AND f.purpose IN ('CMS_IMAGE', 'ASSOCIATION_LOGO')
          AND (
            EXISTS (SELECT 1 FROM association_settings x WHERE x."logoFileId" = f.id)
            OR EXISTS (SELECT 1 FROM hero_slides x WHERE x."imageFileId" = f.id AND x."isActive")
            OR EXISTS (SELECT 1 FROM public_programs x WHERE x."imageFileId" = f.id AND x."isPublished")
            OR EXISTS (SELECT 1 FROM public_group_listings x WHERE x."imageFileId" = f.id
                         AND x."isPublished" AND x."publicStatus" <> 'CLOSED')
            OR EXISTS (SELECT 1 FROM public_events x WHERE x."imageFileId" = f.id
                         AND x."isPublished" AND x."isPublic")
            OR EXISTS (SELECT 1 FROM achievements x WHERE x."imageFileId" = f.id AND x."isPublished")
            OR EXISTS (SELECT 1 FROM news_articles x WHERE x."coverImageFileId" = f.id
                         AND x."isPublished" AND x."publishedAt" <= ${today}::date)
            OR EXISTS (SELECT 1 FROM gallery_images x WHERE x."imageFileId" = f.id AND x."isPublished")
            OR EXISTS (SELECT 1 FROM quran_graduates x WHERE x."photoFileId" = f.id
                         AND x."isPublished" AND x."consentRecordedAt" IS NOT NULL)
            OR EXISTS (SELECT 1 FROM administration_members x WHERE x."photoFileId" = f.id AND x."isPublished")
          )
      ) AS ok`;
    return row.ok;
  }

  /**
   * Authenticated access, decided from what the file is attached to and the
   * viewer's CURRENT permissions — never from knowing the id:
   *  - ADMIN: every file (administrative access);
   *  - the uploader: their own upload;
   *  - anyone: a publicly eligible file;
   *  - a resource file: whoever may read that resource now (teacher: current
   *    classes or own resource; student: current class/group, all-students);
   *  - a profile photo: the person, the teachers of their current class
   *    (students) or of the same classes (teachers), and the students of a
   *    teacher's current classes.
   */
  async canAccess(fileId: string, user: AuthPrincipal): Promise<boolean> {
    if (user.roles.includes(Role.ADMIN)) return true;
    const file = await this.prisma.storedFile.findUnique({
      where: { id: fileId },
      select: { uploadedByUserId: true },
    });
    if (!file) return false;
    if (file.uploadedByUserId === user.userId) return true;
    if (await this.isPublic(fileId)) return true;

    if (user.roles.includes(Role.TEACHER)) {
      const scope = await this.teacherAccess
        .currentScope(user.userId)
        .catch(() => null);
      if (
        scope &&
        (await this.prisma.resource.count({
          where: { fileId, ...teacherResourceWhere(scope, user.userId) },
        }))
      )
        return true;
    }
    if (user.roles.includes(Role.STUDENT)) {
      const scope = await this.studentAccess
        .scopeOf(user.userId)
        .catch(() => null);
      if (
        scope &&
        (await this.prisma.resource.count({
          where: { fileId, ...studentResourceWhere(scope) },
        }))
      )
        return true;
    }
    return this.canSeePhoto(fileId, user.userId);
  }

  private async canSeePhoto(fileId: string, userId: string): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ ok: boolean }[]>`
      WITH me AS (
        SELECT u."personId", t.id AS "teacherId", s."groupClassId" AS "studentClassId"
        FROM users u
        LEFT JOIN teachers t ON t."personId" = u."personId" AND t.status = 'ACTIVE'
        LEFT JOIN students s ON s."personId" = u."personId" AND s.status = 'ACTIVE'
        WHERE u.id = ${userId}::uuid
      ),
      my_classes AS (
        SELECT gc.id FROM group_classes gc, me
        WHERE gc."supervisorId" = me."teacherId"
           OR EXISTS (SELECT 1 FROM group_class_assistants a
                      WHERE a."groupClassId" = gc.id AND a."teacherId" = me."teacherId")
      ),
      owner AS (
        SELECT p.id AS "personId", t.id AS "teacherId", s."groupClassId" AS "studentClassId"
        FROM persons p
        LEFT JOIN teachers t ON t."personId" = p.id
        LEFT JOIN students s ON s."personId" = p.id
        WHERE p."photoFileId" = ${fileId}::uuid
      )
      SELECT EXISTS (
        SELECT 1 FROM owner o, me
        WHERE o."personId" = me."personId"
           -- a teacher sees the students of their current classes…
           OR o."studentClassId" IN (SELECT id FROM my_classes)
           -- …and the teachers of the same classes
           OR EXISTS (SELECT 1 FROM group_classes gc
                      WHERE gc.id IN (SELECT id FROM my_classes)
                        AND (gc."supervisorId" = o."teacherId"
                             OR EXISTS (SELECT 1 FROM group_class_assistants a
                                        WHERE a."groupClassId" = gc.id AND a."teacherId" = o."teacherId")))
           -- a student sees the teachers of their current class
           OR EXISTS (SELECT 1 FROM group_classes gc
                      WHERE gc.id = me."studentClassId"
                        AND (gc."supervisorId" = o."teacherId"
                             OR EXISTS (SELECT 1 FROM group_class_assistants a
                                        WHERE a."groupClassId" = gc.id AND a."teacherId" = o."teacherId")))
      ) AS ok`;
    return row.ok;
  }

  /** Metadata + stream of a file the caller was authorized for. */
  async openContent(fileId: string) {
    const file = await this.prisma.storedFile.findUnique({
      where: { id: fileId },
      select: {
        storageKey: true,
        mimeType: true,
        size: true,
        checksum: true,
        originalName: true,
      },
    });
    if (!file) throw fileNotFound();
    const size = await this.storage.size(file.storageKey);
    if (size === null) {
      this.logger.error(`Stored bytes missing for file ${fileId}`);
      throw new NotFoundException({
        code: 'FILE_CONTENT_UNAVAILABLE',
        message: 'محتوى الملف غير متوفر حاليًا',
      });
    }
    return { ...file, size, stream: () => this.storage.open(file.storageKey) };
  }

  /* ------------------------------ cleanup ------------------------------ */

  /**
   * Removes files referenced by NOTHING and older than the retention period
   * (recent uploads may still be awaiting attachment), one per transaction:
   * row claimed FOR UPDATE SKIP LOCKED (files being attached hold KEY SHARE
   * and are skipped), references re-checked, row deleted (the FK RESTRICT is
   * the last guard), THEN the bytes removed. A crash between the two leaves
   * only orphan bytes, which the sweep below removes later — never a row
   * pointing to missing bytes. Also sweeps abandoned temporary uploads.
   */
  async cleanup(limit = 500) {
    const before = new Date(Date.now() - this.retentionHours * 3_600_000);
    const candidates = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT f.id FROM stored_files f
      WHERE f."createdAt" < ${before} AND ${UNREFERENCED}
      ORDER BY f."createdAt" LIMIT ${limit}`;
    let deletedFiles = 0;
    for (const { id } of candidates) {
      const key = await this.prisma
        .$transaction(async (tx) => {
          const [row] = await tx.$queryRaw<{ storageKey: string }[]>`
            SELECT f."storageKey" FROM stored_files f
            WHERE f.id = ${id}::uuid AND ${UNREFERENCED}
            FOR UPDATE SKIP LOCKED`;
          if (!row) return null;
          await tx.storedFile.delete({ where: { id } });
          return row.storageKey;
        })
        .catch((error: unknown) => {
          // Referenced meanwhile (FK RESTRICT): keep it
          this.logger.warn(`File ${id} kept: ${(error as Error).message}`);
          return null;
        });
      if (!key) continue;
      deletedFiles += 1;
      await this.storage
        .remove(key)
        .catch((error: unknown) =>
          this.logger.error(
            `Bytes of deleted file ${id} not removed`,
            error as Error,
          ),
        );
    }

    // Orphan bytes (no row) and abandoned temporary uploads
    let orphanBytes = 0;
    const keys = await this.storage.listKeys(before);
    for (let i = 0; i < keys.length; i += 500) {
      const batch = keys.slice(i, i + 500);
      const known = new Set(
        (
          await this.prisma.storedFile.findMany({
            where: { storageKey: { in: batch } },
            select: { storageKey: true },
          })
        ).map((f) => f.storageKey),
      );
      for (const key of batch.filter((k) => !known.has(k))) {
        await this.storage.remove(key);
        orphanBytes += 1;
      }
    }
    const staleTemp = await this.storage.listStaleTemp(
      new Date(Date.now() - 3_600_000),
    );
    for (const path of staleTemp) await this.storage.discard(path);
    return { deletedFiles, orphanBytes, staleTemp: staleTemp.length };
  }
}

/** "ab/cd/<uuid>" — random, never derived from the client's filename. */
function newStorageKey() {
  const id = randomUUID();
  return `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
}

function detectKind(mimeType: string): FileKind {
  if (mimeType === 'application/pdf') return 'PDF';
  return mimeType.startsWith('audio/') ? 'AUDIO' : 'IMAGE';
}

async function readHead(path: string): Promise<Uint8Array> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(SIGNATURE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SIGNATURE_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function sha256(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolvePromise(hash.digest('hex')));
  });
}
