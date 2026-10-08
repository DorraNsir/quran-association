/**
 * Canonical surah list (mushaf order). The stored value is ALWAYS the number
 * (1–114); names are derived for display. Same data as the frontend
 * (frontend/src/lib/quran/surahs.ts).
 *
 * NOTE: a higher number does NOT mean more progress — many students memorize
 * from the end of the Quran (An-Nas) towards the beginning.
 */
export const SURAH_COUNT = 114;

const SURAHS: readonly { nameAr: string; nameLatin: string }[] = [
  { nameAr: 'الفاتحة', nameLatin: 'Al-Fatiha' }, // 1
  { nameAr: 'البقرة', nameLatin: 'Al-Baqara' }, // 2
  { nameAr: 'آل عمران', nameLatin: 'Al Imran' }, // 3
  { nameAr: 'النساء', nameLatin: 'An-Nisa' }, // 4
  { nameAr: 'المائدة', nameLatin: 'Al-Maida' }, // 5
  { nameAr: 'الأنعام', nameLatin: 'Al-Anam' }, // 6
  { nameAr: 'الأعراف', nameLatin: 'Al-Araf' }, // 7
  { nameAr: 'الأنفال', nameLatin: 'Al-Anfal' }, // 8
  { nameAr: 'التوبة', nameLatin: 'At-Tawba' }, // 9
  { nameAr: 'يونس', nameLatin: 'Yunus' }, // 10
  { nameAr: 'هود', nameLatin: 'Hud' }, // 11
  { nameAr: 'يوسف', nameLatin: 'Yusuf' }, // 12
  { nameAr: 'الرعد', nameLatin: 'Ar-Rad' }, // 13
  { nameAr: 'إبراهيم', nameLatin: 'Ibrahim' }, // 14
  { nameAr: 'الحجر', nameLatin: 'Al-Hijr' }, // 15
  { nameAr: 'النحل', nameLatin: 'An-Nahl' }, // 16
  { nameAr: 'الإسراء', nameLatin: 'Al-Isra' }, // 17
  { nameAr: 'الكهف', nameLatin: 'Al-Kahf' }, // 18
  { nameAr: 'مريم', nameLatin: 'Maryam' }, // 19
  { nameAr: 'طه', nameLatin: 'Ta-Ha' }, // 20
  { nameAr: 'الأنبياء', nameLatin: 'Al-Anbiya' }, // 21
  { nameAr: 'الحج', nameLatin: 'Al-Hajj' }, // 22
  { nameAr: 'المؤمنون', nameLatin: 'Al-Muminun' }, // 23
  { nameAr: 'النور', nameLatin: 'An-Nur' }, // 24
  { nameAr: 'الفرقان', nameLatin: 'Al-Furqan' }, // 25
  { nameAr: 'الشعراء', nameLatin: 'Ash-Shuara' }, // 26
  { nameAr: 'النمل', nameLatin: 'An-Naml' }, // 27
  { nameAr: 'القصص', nameLatin: 'Al-Qasas' }, // 28
  { nameAr: 'العنكبوت', nameLatin: 'Al-Ankabut' }, // 29
  { nameAr: 'الروم', nameLatin: 'Ar-Rum' }, // 30
  { nameAr: 'لقمان', nameLatin: 'Luqman' }, // 31
  { nameAr: 'السجدة', nameLatin: 'As-Sajda' }, // 32
  { nameAr: 'الأحزاب', nameLatin: 'Al-Ahzab' }, // 33
  { nameAr: 'سبأ', nameLatin: 'Saba' }, // 34
  { nameAr: 'فاطر', nameLatin: 'Fatir' }, // 35
  { nameAr: 'يس', nameLatin: 'Ya-Sin' }, // 36
  { nameAr: 'الصافات', nameLatin: 'As-Saffat' }, // 37
  { nameAr: 'ص', nameLatin: 'Sad' }, // 38
  { nameAr: 'الزمر', nameLatin: 'Az-Zumar' }, // 39
  { nameAr: 'غافر', nameLatin: 'Ghafir' }, // 40
  { nameAr: 'فصلت', nameLatin: 'Fussilat' }, // 41
  { nameAr: 'الشورى', nameLatin: 'Ash-Shura' }, // 42
  { nameAr: 'الزخرف', nameLatin: 'Az-Zukhruf' }, // 43
  { nameAr: 'الدخان', nameLatin: 'Ad-Dukhan' }, // 44
  { nameAr: 'الجاثية', nameLatin: 'Al-Jathiya' }, // 45
  { nameAr: 'الأحقاف', nameLatin: 'Al-Ahqaf' }, // 46
  { nameAr: 'محمد', nameLatin: 'Muhammad' }, // 47
  { nameAr: 'الفتح', nameLatin: 'Al-Fath' }, // 48
  { nameAr: 'الحجرات', nameLatin: 'Al-Hujurat' }, // 49
  { nameAr: 'ق', nameLatin: 'Qaf' }, // 50
  { nameAr: 'الذاريات', nameLatin: 'Adh-Dhariyat' }, // 51
  { nameAr: 'الطور', nameLatin: 'At-Tur' }, // 52
  { nameAr: 'النجم', nameLatin: 'An-Najm' }, // 53
  { nameAr: 'القمر', nameLatin: 'Al-Qamar' }, // 54
  { nameAr: 'الرحمن', nameLatin: 'Ar-Rahman' }, // 55
  { nameAr: 'الواقعة', nameLatin: 'Al-Waqia' }, // 56
  { nameAr: 'الحديد', nameLatin: 'Al-Hadid' }, // 57
  { nameAr: 'المجادلة', nameLatin: 'Al-Mujadila' }, // 58
  { nameAr: 'الحشر', nameLatin: 'Al-Hashr' }, // 59
  { nameAr: 'الممتحنة', nameLatin: 'Al-Mumtahana' }, // 60
  { nameAr: 'الصف', nameLatin: 'As-Saff' }, // 61
  { nameAr: 'الجمعة', nameLatin: 'Al-Jumua' }, // 62
  { nameAr: 'المنافقون', nameLatin: 'Al-Munafiqun' }, // 63
  { nameAr: 'التغابن', nameLatin: 'At-Taghabun' }, // 64
  { nameAr: 'الطلاق', nameLatin: 'At-Talaq' }, // 65
  { nameAr: 'التحريم', nameLatin: 'At-Tahrim' }, // 66
  { nameAr: 'الملك', nameLatin: 'Al-Mulk' }, // 67
  { nameAr: 'القلم', nameLatin: 'Al-Qalam' }, // 68
  { nameAr: 'الحاقة', nameLatin: 'Al-Haqqa' }, // 69
  { nameAr: 'المعارج', nameLatin: 'Al-Maarij' }, // 70
  { nameAr: 'نوح', nameLatin: 'Nuh' }, // 71
  { nameAr: 'الجن', nameLatin: 'Al-Jinn' }, // 72
  { nameAr: 'المزمل', nameLatin: 'Al-Muzzammil' }, // 73
  { nameAr: 'المدثر', nameLatin: 'Al-Muddaththir' }, // 74
  { nameAr: 'القيامة', nameLatin: 'Al-Qiyama' }, // 75
  { nameAr: 'الإنسان', nameLatin: 'Al-Insan' }, // 76
  { nameAr: 'المرسلات', nameLatin: 'Al-Mursalat' }, // 77
  { nameAr: 'النبأ', nameLatin: 'An-Naba' }, // 78
  { nameAr: 'النازعات', nameLatin: 'An-Naziat' }, // 79
  { nameAr: 'عبس', nameLatin: 'Abasa' }, // 80
  { nameAr: 'التكوير', nameLatin: 'At-Takwir' }, // 81
  { nameAr: 'الانفطار', nameLatin: 'Al-Infitar' }, // 82
  { nameAr: 'المطففين', nameLatin: 'Al-Mutaffifin' }, // 83
  { nameAr: 'الانشقاق', nameLatin: 'Al-Inshiqaq' }, // 84
  { nameAr: 'البروج', nameLatin: 'Al-Buruj' }, // 85
  { nameAr: 'الطارق', nameLatin: 'At-Tariq' }, // 86
  { nameAr: 'الأعلى', nameLatin: 'Al-Ala' }, // 87
  { nameAr: 'الغاشية', nameLatin: 'Al-Ghashiya' }, // 88
  { nameAr: 'الفجر', nameLatin: 'Al-Fajr' }, // 89
  { nameAr: 'البلد', nameLatin: 'Al-Balad' }, // 90
  { nameAr: 'الشمس', nameLatin: 'Ash-Shams' }, // 91
  { nameAr: 'الليل', nameLatin: 'Al-Layl' }, // 92
  { nameAr: 'الضحى', nameLatin: 'Ad-Duha' }, // 93
  { nameAr: 'الشرح', nameLatin: 'Ash-Sharh' }, // 94
  { nameAr: 'التين', nameLatin: 'At-Tin' }, // 95
  { nameAr: 'العلق', nameLatin: 'Al-Alaq' }, // 96
  { nameAr: 'القدر', nameLatin: 'Al-Qadr' }, // 97
  { nameAr: 'البينة', nameLatin: 'Al-Bayyina' }, // 98
  { nameAr: 'الزلزلة', nameLatin: 'Az-Zalzala' }, // 99
  { nameAr: 'العاديات', nameLatin: 'Al-Adiyat' }, // 100
  { nameAr: 'القارعة', nameLatin: 'Al-Qaria' }, // 101
  { nameAr: 'التكاثر', nameLatin: 'At-Takathur' }, // 102
  { nameAr: 'العصر', nameLatin: 'Al-Asr' }, // 103
  { nameAr: 'الهمزة', nameLatin: 'Al-Humaza' }, // 104
  { nameAr: 'الفيل', nameLatin: 'Al-Fil' }, // 105
  { nameAr: 'قريش', nameLatin: 'Quraysh' }, // 106
  { nameAr: 'الماعون', nameLatin: 'Al-Maun' }, // 107
  { nameAr: 'الكوثر', nameLatin: 'Al-Kawthar' }, // 108
  { nameAr: 'الكافرون', nameLatin: 'Al-Kafirun' }, // 109
  { nameAr: 'النصر', nameLatin: 'An-Nasr' }, // 110
  { nameAr: 'المسد', nameLatin: 'Al-Masad' }, // 111
  { nameAr: 'الإخلاص', nameLatin: 'Al-Ikhlas' }, // 112
  { nameAr: 'الفلق', nameLatin: 'Al-Falaq' }, // 113
  { nameAr: 'الناس', nameLatin: 'An-Nas' }, // 114
];

export function surahName(number: number) {
  return SURAHS[number - 1]?.nameAr;
}

export function surahNameLatin(number: number) {
  return SURAHS[number - 1]?.nameLatin;
}
