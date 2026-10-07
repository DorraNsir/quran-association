/**
 * Development seed — FOUNDATIONAL data only, safe to rerun (upserts):
 *   - the current academic year (2026–2027, two semesters)
 *   - association identity, platform settings and public-site settings
 *     (same content as the frontend prototype)
 *   - OPTIONAL development admin account, only when NODE_ENV is not
 *     "production" AND DEV_SEED_ADMIN_USERNAME / DEV_SEED_ADMIN_PASSWORD are
 *     set in the environment (no credential is ever committed). The password
 *     is stored as an Argon2id hash; an existing account is left untouched.
 *
 * Run: npm run db:seed   (prisma db seed → tsx prisma/seed.ts)
 */
import 'reflect-metadata';
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PasswordService } from '../src/auth/password.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const CURRENT_YEAR = {
  label: '2026–2027',
  startDate: date('2026-09-14'),
  endDate: date('2027-06-30'),
  semester2StartDate: date('2027-02-01'),
};

const SITE = {
  shortDescription:
    'بيئة تربوية لحفظ كتاب الله وتعلّمه، تجمع الأطفال والشباب والكبار حول القرآن الكريم.',
  about:
    'الفرع المحلي عمر بن الخطاب جمعية قرآنية تعمل بدار شعبان الفهري على تحفيظ القرآن الكريم وتعليم أحكام التجويد، في حلقات منظمة يؤطّرها معلمون مؤهلون.\n\nنرافق طلبتنا خطوة بخطوة: من أول سورة يحفظها الطفل إلى ختم كتاب الله، مع متابعة تربوية مستمرة وتواصل دائم مع الأولياء.',
  history:
    'انطلقت الجمعية بحلقة واحدة في المقر الرئيسي، ثم توسّعت تدريجيًا لتشمل اليوم عدة فروع بالمدينة، بفضل ثقة الأولياء وتطوّع المعلمين.\n\nعلى مرّ السنوات تخرّج من حلقاتنا عشرات الخاتمين، وشارك طلبتنا في مسابقات قرآنية جهوية ووطنية.',
  mission:
    'تيسير حفظ القرآن الكريم وفهمه لكل الفئات العمرية، في بيئة تربوية آمنة تُنمّي الأخلاق وحب كتاب الله.',
  vision:
    'أن تكون الجمعية مرجعًا قرآنيًا وتربويًا في الجهة، يتخرّج منها حفظة متقنون نافعون لمجتمعهم.',
  values:
    'الإخلاص في خدمة كتاب الله\nالإتقان في الحفظ والتلاوة\nالرفق والقدوة الحسنة\nالتعاون مع الأسرة\nالانفتاح على المجتمع',
  openingHours: 'من الاثنين إلى السبت: 09:00 – 12:00 و 15:00 – 19:00',
  mapUrl: 'https://maps.google.com/?q=Dar+Chaabane+El+Fehri',
  facebookUrl: 'https://facebook.com/',
  registrationEnabled: true,
};

async function main() {
  await prisma.$transaction(async (tx) => {
    // Academic year: created once; only flagged current when no year is
    // current yet (a rerun never steals the flag from an admin's choice).
    const hasCurrent =
      (await tx.academicYear.count({ where: { isCurrent: true } })) > 0;
    await tx.academicYear.upsert({
      where: { label: CURRENT_YEAR.label },
      update: {},
      create: { ...CURRENT_YEAR, isCurrent: !hasCurrent },
    });

    // Singletons (id = 1): created with defaults, never overwritten on rerun.
    await tx.associationSettings.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        name: 'الفرع المحلي عمر بن الخطاب بدار شعبان الفهري',
        phone: '72290415',
        email: 'contact@omar-khattab.tn',
        address: 'نهج الجامع الكبير، دار شعبان الفهري 8011، نابل',
      },
    });
    await tx.platformSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    await tx.siteSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...SITE },
    });
  });

  await seedDevelopmentAdmin();

  const current = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
  });
  console.log(`Seed done — current academic year: ${current?.label ?? 'none'}`);
}

/** Dev-only ADMIN account from environment variables (see .env.example). */
async function seedDevelopmentAdmin() {
  const username = process.env.DEV_SEED_ADMIN_USERNAME?.trim();
  const password = process.env.DEV_SEED_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    if (username || password)
      console.warn('DEV_SEED_ADMIN_* ignored in production.');
    return;
  }
  if (!username || !password) {
    console.log(
      'Development admin: skipped (DEV_SEED_ADMIN_USERNAME / DEV_SEED_ADMIN_PASSWORD not set).',
    );
    return;
  }
  if (password.length < 8)
    throw new Error('DEV_SEED_ADMIN_PASSWORD must be at least 8 characters');

  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existing) {
    console.log(
      `Development admin "${username}": already exists (left unchanged).`,
    );
    return;
  }
  const passwordHash = await new PasswordService().hash(password);
  await prisma.person.create({
    data: {
      firstName: 'مسؤول',
      lastName: 'التطوير',
      user: {
        create: {
          username,
          passwordHash,
          // Developer-chosen password: no forced change for this local account
          mustChangePassword: false,
          roles: { create: [{ role: 'ADMIN' }] },
        },
      },
    },
  });
  console.log(`Development admin "${username}": created (ADMIN).`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
