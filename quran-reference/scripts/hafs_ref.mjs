// COMPARISON ONLY: Hafs/Madinah 604-page starts from quran-meta (MIT), used to FLAG differences, never as a source.
import { getPageMeta, findSurahAyahByAyahId, getRubAlHizbMeta, getSurahMeta } from '../work/qm/package/dist/hafs.js';
const pages = [];
for (let p = 1; p <= 604; p++) {
  const m = getPageMeta(p);
  pages.push({ page: p, start: findSurahAyahByAyahId(m.firstAyahId) });
}
const rubs = [];
for (let q = 1; q <= 240; q++) rubs.push({ q, start: findSurahAyahByAyahId(getRubAlHizbMeta(q).firstAyahId) });
const counts = Array.from({ length: 114 }, (_, i) => getSurahMeta(i + 1).ayahCount);
console.log(JSON.stringify({ pages, rubs, counts }));
