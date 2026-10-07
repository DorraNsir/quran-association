import type {
  Achievement,
  AdministrationMember,
  GalleryImage,
  HeroSlide,
  NewsArticle,
  PublicEvent,
  PublicGroupListing,
  PublicProgram,
  QuranGraduate,
  ServiceOffering,
  SiteSettings,
} from "@/types/domain"

/**
 * Public website content (CMS seed). Images are local placeholder artworks
 * in /public/website — the administration replaces them with real photos
 * from the CMS (object storage later).
 */
const img = (name: string) => `/website/${name}.svg`
const T = { createdAt: "2026-09-01", updatedAt: "2026-09-01" }

export const siteSettings: SiteSettings = {
  shortDescriptionAr: "بيئة تربوية لحفظ كتاب الله وتعلّمه، تجمع الأطفال والشباب والكبار حول القرآن الكريم.",
  aboutAr:
    "الفرع المحلي عمر بن الخطاب جمعية قرآنية تعمل بدار شعبان الفهري على تحفيظ القرآن الكريم وتعليم أحكام التجويد، في حلقات منظمة يؤطّرها معلمون مؤهلون.\n\nنرافق طلبتنا خطوة بخطوة: من أول سورة يحفظها الطفل إلى ختم كتاب الله، مع متابعة تربوية مستمرة وتواصل دائم مع الأولياء.",
  historyAr:
    "انطلقت الجمعية بحلقة واحدة في المقر الرئيسي، ثم توسّعت تدريجيًا لتشمل اليوم عدة فروع بالمدينة، بفضل ثقة الأولياء وتطوّع المعلمين.\n\nعلى مرّ السنوات تخرّج من حلقاتنا عشرات الخاتمين، وشارك طلبتنا في مسابقات قرآنية جهوية ووطنية.",
  missionAr: "تيسير حفظ القرآن الكريم وفهمه لكل الفئات العمرية، في بيئة تربوية آمنة تُنمّي الأخلاق وحب كتاب الله.",
  visionAr: "أن تكون الجمعية مرجعًا قرآنيًا وتربويًا في الجهة، يتخرّج منها حفظة متقنون نافعون لمجتمعهم.",
  valuesAr: "الإخلاص في خدمة كتاب الله\nالإتقان في الحفظ والتلاوة\nالرفق والقدوة الحسنة\nالتعاون مع الأسرة\nالانفتاح على المجتمع",
  openingHoursAr: "من الاثنين إلى السبت: 09:00 – 12:00 و 15:00 – 19:00",
  mapUrl: "https://maps.google.com/?q=Dar+Chaabane+El+Fehri",
  facebookUrl: "https://facebook.com/",
  registrationEnabled: true,
  updatedAt: "2026-09-01",
}

export const heroSlides: HeroSlide[] = [
  {
    id: "hero1",
    imageUrl: img("halaqa"),
    titleAr: "بيئة تربوية لحفظ كتاب الله وتعلّمه",
    subtitleAr: "حلقات منظمة لكل الأعمار، يؤطّرها معلمون مؤهلون ومتابعة مستمرة لكل طالب.",
    ctaLabelAr: "سجل الآن",
    ctaHref: "/registration",
    displayOrder: 1,
    isActive: true,
    ...T,
  },
  {
    id: "hero2",
    imageUrl: img("children"),
    titleAr: "من أول سورة إلى ختم القرآن",
    subtitleAr: "نرافق أبناءكم في رحلة الحفظ والمراجعة والتجويد، خطوة بخطوة.",
    ctaLabelAr: "اكتشف برامجنا",
    ctaHref: "/programs",
    displayOrder: 2,
    isActive: true,
    ...T,
  },
  {
    id: "hero3",
    imageUrl: img("summer"),
    titleAr: "البرنامج الصيفي 2027",
    subtitleAr: "شهران من الحفظ والأنشطة للأطفال — التسجيل مفتوح.",
    ctaLabelAr: "اطّلع على المجموعات",
    ctaHref: "/groups",
    displayOrder: 3,
    isActive: false,
    ...T,
  },
]

export const serviceOfferings: ServiceOffering[] = [
  { id: "off1", titleAr: "تحفيظ القرآن الكريم", descriptionAr: "برنامج حفظ متدرّج حسب مستوى كل طالب.", icon: "book", displayOrder: 1, isPublished: true, ...T },
  { id: "off2", titleAr: "مراجعة وتثبيت الحفظ", descriptionAr: "مراجعة دورية تضمن رسوخ ما حُفظ.", icon: "repeat", displayOrder: 2, isPublished: true, ...T },
  { id: "off3", titleAr: "تعليم أحكام التجويد", descriptionAr: "تلاوة صحيحة وفق رواية حفص عن عاصم.", icon: "mic", displayOrder: 3, isPublished: true, ...T },
  { id: "off4", titleAr: "متابعة تربوية مستمرة", descriptionAr: "تواصل منتظم مع الأولياء حول تقدّم أبنائهم.", icon: "heart", displayOrder: 4, isPublished: true, ...T },
  { id: "off5", titleAr: "معلمون مؤهلون", descriptionAr: "حفظة مجازون وذوو خبرة تربوية.", icon: "teacher", displayOrder: 5, isPublished: true, ...T },
  { id: "off6", titleAr: "أنشطة تربوية", descriptionAr: "مسابقات، رحلات ولقاءات تُحبّب القرآن للطلبة.", icon: "sparkles", displayOrder: 6, isPublished: true, ...T },
  { id: "off7", titleAr: "حصص منظمة", descriptionAr: "برنامج أسبوعي واضح في قاعات مهيّأة.", icon: "calendar", displayOrder: 7, isPublished: false, ...T },
]

export const publicPrograms: PublicProgram[] = [
  { id: "prg1", titleAr: "حفظ القرآن الكريم", descriptionAr: "حلقات حفظ متدرّجة من جزء عمّ إلى ختم المصحف، بإشراف معلم لكل حلقة.", imageUrl: img("halaqa"), icon: "book", displayOrder: 1, isPublished: true, ...T },
  { id: "prg2", titleAr: "التجويد والتلاوة", descriptionAr: "تعلّم أحكام التجويد نظريًا وتطبيقيًا لتلاوة صحيحة متقنة.", imageUrl: img("tajwid"), icon: "mic", displayOrder: 2, isPublished: true, ...T },
  { id: "prg3", titleAr: "برامج الأطفال", descriptionAr: "حلقات مخصّصة للأطفال من 5 إلى 12 سنة بأساليب محبّبة ومحفّزة.", imageUrl: img("children"), icon: "child", displayOrder: 3, isPublished: true, ...T },
  { id: "prg4", titleAr: "برامج الشباب والكبار", descriptionAr: "حلقات مسائية تناسب الدارسين والعاملين، للحفظ والمراجعة.", imageUrl: img("circle"), icon: "users", displayOrder: 4, isPublished: true, ...T },
  { id: "prg5", titleAr: "البرامج الصيفية", descriptionAr: "برنامج مكثّف خلال العطلة يجمع الحفظ والأنشطة التربوية.", imageUrl: img("summer"), icon: "sun", displayOrder: 5, isPublished: true, ...T },
  { id: "prg6", titleAr: "الأنشطة التربوية", descriptionAr: "مسابقات قرآنية، حفلات تكريم وأمسيات ثقافية على مدار السنة.", imageUrl: img("lanterns"), icon: "sparkles", displayOrder: 6, isPublished: true, ...T },
]

export const publicGroups: PublicGroupListing[] = [
  {
    id: "pg1",
    groupId: "g12",
    titleAr: "المجموعة الصيفية للأطفال 2027",
    audienceAr: "أطفال 6–9 سنوات",
    descriptionAr: "شهران من الحفظ والمراجعة والأنشطة الهادفة خلال عطلة الصيف.",
    branchId: "b1",
    startDate: "2027-07-01",
    scheduleAr: "من الاثنين إلى الخميس صباحًا",
    imageUrl: img("summer"),
    publicStatus: "COMING_SOON",
    registrationOpen: true,
    displayOrder: 1,
    isPublished: true,
    ...T,
  },
  {
    id: "pg2",
    titleAr: "حلقة تجويد للكبار",
    audienceAr: "الكبار (18 سنة فما فوق)",
    descriptionAr: "حلقة مسائية لتعلّم أحكام التجويد وتصحيح التلاوة.",
    branchId: "b2",
    startDate: "2026-11-02",
    scheduleAr: "الاثنين والخميس 19:00 – 20:30",
    imageUrl: img("tajwid"),
    publicStatus: "OPEN",
    registrationOpen: true,
    displayOrder: 2,
    isPublished: true,
    ...T,
  },
  {
    id: "pg3",
    titleAr: "حلقة البنات — فرع الفهري",
    audienceAr: "فتيات 10–14 سنة",
    branchId: "b3",
    publicStatus: "COMING_SOON",
    registrationOpen: false,
    displayOrder: 3,
    isPublished: false,
    ...T,
  },
]

export const publicEvents: PublicEvent[] = [
  {
    id: "ev1",
    titleAr: "حفل تكريم خاتمي كتاب الله",
    descriptionAr: "حفل سنوي لتكريم الطلبة الذين أتمّوا حفظ القرآن الكريم، بحضور الأولياء والمعلمين.",
    startDate: "2026-10-24",
    time: "16:00",
    location: "المقر الرئيسي — دار شعبان الفهري",
    imageUrl: img("ceremony"),
    isPublic: true,
    isPublished: true,
    isCancelled: false,
    ...T,
  },
  {
    id: "ev2",
    titleAr: "أمسية قرآنية مفتوحة",
    descriptionAr: "تلاوات لطلبة الجمعية وكلمة تربوية، مفتوحة للعائلات.",
    startDate: "2026-11-14",
    time: "18:30",
    location: "فرع حي الرياض",
    imageUrl: img("lanterns"),
    isPublic: true,
    isPublished: true,
    isCancelled: false,
    ...T,
  },
  {
    id: "ev3",
    titleAr: "المسابقة القرآنية الداخلية",
    descriptionAr: "مسابقة في الحفظ والتجويد بين حلقات الجمعية.",
    startDate: "2026-06-12",
    endDate: "2026-06-13",
    location: "المقر الرئيسي",
    imageUrl: img("competition"),
    isPublic: true,
    isPublished: true,
    isCancelled: false,
    ...T,
  },
  {
    id: "ev4",
    titleAr: "اجتماع تنسيقي للمعلمين",
    descriptionAr: "اجتماع داخلي — لا يظهر على الموقع.",
    startDate: "2026-10-10",
    time: "15:00",
    location: "المقر الرئيسي",
    isPublic: false,
    isPublished: true,
    isCancelled: false,
    ...T,
  },
]

export const newsArticles: NewsArticle[] = [
  {
    id: "news1",
    titleAr: "انطلاق السنة الدراسية 2026–2027",
    excerptAr: "استأنفت حلقات الجمعية نشاطها في كل الفروع بمشاركة أكثر من خمسين طالبًا.",
    contentAr:
      "استأنفت حلقات الجمعية نشاطها مع بداية السنة الدراسية 2026–2027 في كل الفروع، وسط إقبال متزايد من الأطفال والشباب.\n\nوقد تمّ تنظيم لقاء ترحيبي بالطلبة الجدد وأوليائهم، تمّ خلاله التعريف ببرنامج السنة وطرق المتابعة.",
    coverImageUrl: img("children"),
    publishedAt: "2026-09-15",
    isPublished: true,
    ...T,
  },
  {
    id: "news2",
    titleAr: "افتتاح حلقة جديدة بفرع حي الرياض",
    excerptAr: "توسّعت الجمعية بافتتاح حلقة جديدة لمجموعة ماهر بفرع حي الرياض.",
    contentAr:
      "في إطار تقريب الحلقات من العائلات، افتتحت الجمعية حلقة جديدة بفرع حي الرياض تشرف عليها الأستاذة درة بن سالم.\n\nتستقبل الحلقة الأطفال من 8 إلى 11 سنة يوم الأحد مساءً.",
    coverImageUrl: img("building"),
    publishedAt: "2026-09-20",
    isPublished: true,
    ...T,
  },
  {
    id: "news3",
    titleAr: "مسودة: برنامج الأنشطة الثقافية",
    excerptAr: "قيد الإعداد.",
    contentAr: "قيد الإعداد.",
    publishedAt: "2026-10-01",
    isPublished: false,
    ...T,
  },
]

export const galleryImages: GalleryImage[] = [
  { id: "gal1", imageUrl: img("circle"), titleAr: "حلقة حفظ صباحية", category: "SESSIONS", displayOrder: 1, isPublished: true, ...T },
  { id: "gal2", imageUrl: img("ceremony"), titleAr: "حفل تكريم الخاتمين", category: "CEREMONIES", displayOrder: 2, isPublished: true, ...T },
  { id: "gal3", imageUrl: img("summer"), titleAr: "البرنامج الصيفي", category: "SUMMER", displayOrder: 3, isPublished: true, ...T },
  { id: "gal4", imageUrl: img("competition"), titleAr: "المسابقة القرآنية", category: "ACTIVITIES", displayOrder: 4, isPublished: true, ...T },
  { id: "gal5", imageUrl: img("library"), titleAr: "مكتبة الجمعية", category: "LIFE", displayOrder: 5, isPublished: true, ...T },
  { id: "gal6", imageUrl: img("lanterns"), titleAr: "أمسية رمضانية", category: "ACTIVITIES", displayOrder: 6, isPublished: true, ...T },
]

export const quranGraduates: QuranGraduate[] = [
  { id: "qg1", fullName: "عبد الرحمن الشابي", completionYear: 2026, shortMessage: "ختم القرآن برواية حفص في سنّ الرابعة عشرة.", displayOrder: 1, isPublished: true, ...T },
  { id: "qg2", fullName: "خديجة المنصوري", completionYear: 2026, displayOrder: 2, isPublished: true, ...T },
  { id: "qg3", fullName: "محمد علي بن عمر", completionYear: 2025, displayOrder: 3, isPublished: true, ...T },
  { id: "qg4", fullName: "سارة القيزاني", completionYear: 2025, displayOrder: 4, isPublished: true, ...T },
  { id: "qg5", fullName: "أنس الورتاني", completionYear: 2024, displayOrder: 5, isPublished: true, ...T },
]

export const administrationMembers: AdministrationMember[] = [
  { id: "am1", fullName: "الطاهر بن يوسف", roleAr: "رئيس الجمعية", shortBioAr: "أستاذ متقاعد، يرافق الجمعية منذ تأسيسها.", displayOrder: 1, isPublished: true, ...T },
  { id: "am2", fullName: "نجوى الحمروني", roleAr: "نائبة الرئيس", displayOrder: 2, isPublished: true, ...T },
  { id: "am3", fullName: "كمال الدريدي", roleAr: "الكاتب العام", displayOrder: 3, isPublished: true, ...T },
  { id: "am4", fullName: "منير السوسي", roleAr: "أمين المال", displayOrder: 4, isPublished: true, ...T },
]

export const achievements: Achievement[] = [
  { id: "ach1", titleAr: "تتويج طلبتنا في المسابقة الجهوية لحفظ القرآن", descriptionAr: "أحرز ثلاثة من طلبة الجمعية مراتب متقدّمة في المسابقة الجهوية بنابل.", year: 2026, imageUrl: img("competition"), category: "COMPETITION", isFeatured: true, isPublished: true, displayOrder: 1, ...T },
  { id: "ach2", titleAr: "افتتاح فرع حي الرياض", descriptionAr: "توسّع الجمعية بفرع ثانٍ لتقريب الحلقات من العائلات.", year: 2025, imageUrl: img("building"), category: "MILESTONE", isFeatured: true, isPublished: true, displayOrder: 2, ...T },
  { id: "ach3", titleAr: "عشرة خاتمين في سنة واحدة", descriptionAr: "أتمّ عشرة طلبة حفظ كتاب الله خلال السنة الدراسية الماضية.", year: 2025, imageUrl: img("ceremony"), category: "QURAN", isFeatured: true, isPublished: true, displayOrder: 3, ...T },
  { id: "ach4", titleAr: "انطلاق البرنامج الصيفي الأول", descriptionAr: "أول برنامج صيفي مكثّف للأطفال بمشاركة أربعين طالبًا.", year: 2023, imageUrl: img("summer"), category: "ASSOCIATION", isFeatured: false, isPublished: true, displayOrder: 4, ...T },
]
