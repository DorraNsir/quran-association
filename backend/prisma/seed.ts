/**
 * Development seed — FOUNDATIONAL data only, safe to rerun (upserts):
 *   - the current academic year (2026–2027, two semesters)
 *   - association identity, platform settings and public-site settings
 *     (same content as the frontend prototype)
 * Deliberately NO users, passwords or personal data: the first admin account
 * is provisioned with the authentication work (Part 10.2).
 *
 * Run: npm run db:seed   (prisma db seed → tsx prisma/seed.ts)
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

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

  const current = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
  });
  console.log(`Seed done — current academic year: ${current?.label ?? 'none'}`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
