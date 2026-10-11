"use client";

import { useEffect, useRef } from "react";

/**
 * Animated background for the landing hero.
 *
 * Usage (the hero section must be `relative` and `overflow-hidden`):
 *   <section className="relative overflow-hidden bg-[#0d1210]">
 *     <HeroBackground variant="combo" />
 *     <div className="relative z-10">…hero content…</div>
 *   </section>
 *
 * Decorative only (aria-hidden, no pointer events). Every animation stops
 * while the background is off screen and respects prefers-reduced-motion.
 */

export type HeroVariant =
  | "geometric" // Geometric pattern
  | "aurora" // Aurora glow
  | "lights" // Rising lights
  | "stars" // Night sky
  | "letters" // Floating letters
  | "combo"; // Pattern + aurora

/** The six themes an admin can choose for the public hero (API value → Arabic name). */
export const HERO_THEMES: { value: HeroVariant; name: string; description: string }[] = [
  { value: "geometric", name: "زخارف هندسية", description: "نقش إسلامي ذهبي ينساب ببطء ويتبع حركة المؤشر." },
  { value: "aurora", name: "الشفق المضيء", description: "توهّج أخضر وذهبي هادئ يتحرّك في الخلفية." },
  { value: "lights", name: "الأضواء المتصاعدة", description: "نقاط ضوء دافئة تصعد برفق كالفوانيس." },
  { value: "stars", name: "السماء المرصعة بالنجوم", description: "نجوم متلألئة وهلال، مع شهاب عابر أحيانًا." },
  { value: "letters", name: "الحروف العربية", description: "حروف عربية ذهبية تطفو بهدوء." },
  { value: "combo", name: "الزخارف والشفق", description: "النقش الهندسي فوق توهّج الشفق — المظهر الافتراضي." },
];

export const DEFAULT_HERO_THEME: HeroVariant = "combo";

export const isHeroVariant = (value: unknown): value is HeroVariant =>
  HERO_THEMES.some((t) => t.value === value);

type Props = {
  variant?: HeroVariant;
  className?: string;
  /** Font used by the "letters" variant. Use the same Arabic font as your headings. */
  lettersFont?: string;
  /** Adds a dark gradient on the right (RTL text side) so the heading stays readable. */
  textShade?: boolean;
  /** Small previews (admin cards): softer blur, smaller and fewer particles. The public hero never sets it. */
  compact?: boolean;
};

const GOLD = "#d9b46a";

const TILE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'><g fill='none' stroke='${GOLD}' stroke-width='1' stroke-opacity='.55'><rect x='26' y='26' width='44' height='44'/><rect x='26' y='26' width='44' height='44' transform='rotate(45 48 48)'/><circle cx='48' cy='48' r='9'/><path d='M0 0L17 17M96 0L79 17M0 96L17 79M96 96L79 79M48 0V17M48 96V79M0 48H17M96 48H79'/></g></svg>`;
const TILE_URL = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`;

const CSS = `
@keyframes hb-drift { to { background-position: 96px 192px; } }
@keyframes hb-a1 { to { transform: translate(35%, 25%) scale(1.2); } }
@keyframes hb-a2 { to { transform: translate(-40%, -30%) scale(.9); } }
@keyframes hb-a3 { to { transform: translate(50%, -20%) scale(1.3); } }
.hb-geo {
  background-image: ${TILE_URL};
  background-size: 96px 96px;
  animation: hb-drift 60s linear infinite;
  -webkit-mask-image: radial-gradient(circle at var(--hb-mx, 30%) var(--hb-my, 50%), #000 0, rgba(0,0,0,.35) 35%, transparent 75%);
          mask-image: radial-gradient(circle at var(--hb-mx, 30%) var(--hb-my, 50%), #000 0, rgba(0,0,0,.35) 35%, transparent 75%);
}
.hb-aurora { filter: blur(70px); opacity: .75; }
.hb-compact .hb-aurora { filter: blur(28px); }
.hb-aurora > i { position: absolute; border-radius: 50%; mix-blend-mode: screen; }
.hb-aurora > i:nth-child(1) { width: 55%; height: 70%; left: -10%; top: -20%; background: #1f7a45; animation: hb-a1 18s ease-in-out infinite alternate; }
.hb-aurora > i:nth-child(2) { width: 45%; height: 60%; left: 30%; top: 40%; background: #0f5a5a; animation: hb-a2 22s ease-in-out infinite alternate; }
.hb-aurora > i:nth-child(3) { width: 35%; height: 45%; left: 5%; top: 45%; background: #8a6a2a; opacity: .6; animation: hb-a3 26s ease-in-out infinite alternate; }
[data-hb-offscreen] .hb-geo, [data-hb-offscreen] .hb-aurora > i { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  .hb-geo, .hb-aurora > i { animation: none; }
}
`;

const LAYER: React.CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };

export default function HeroBackground({
  variant = "combo",
  className,
  lettersFont = '"Aref Ruqaa", "Amiri", serif',
  textShade = true,
  compact = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const geoRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const showGeo = variant === "geometric" || variant === "combo";
  const showAurora = variant === "aurora" || variant === "combo";
  const canvasMode = variant === "lights" || variant === "stars" || variant === "letters" ? variant : null;

  // CSS animations (pattern drift, aurora) pause while the background is off screen.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || (!showGeo && !showAurora)) return;
    const io = new IntersectionObserver(([entry]) => {
      root.toggleAttribute("data-hb-offscreen", !entry.isIntersecting);
    });
    io.observe(root);
    return () => io.disconnect();
  }, [showGeo, showAurora]);

  // Spotlight that follows the mouse over the hero (geometric pattern).
  useEffect(() => {
    if (!showGeo) return;
    const hero = rootRef.current?.parentElement;
    const geo = geoRef.current;
    if (!hero || !geo) return;
    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      geo.style.setProperty("--hb-mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      geo.style.setProperty("--hb-my", `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    hero.addEventListener("pointermove", onMove);
    return () => hero.removeEventListener("pointermove", onMove);
  }, [showGeo]);

  // Canvas variants: rising lights, night sky, floating letters.
  useEffect(() => {
    if (!canvasMode) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const LETTERS = "ابتثجحخدذرسشصضطظعغفقكلمنهوي".split("");
    // Small previews: fewer, smaller particles (same look, less work)
    const size = compact ? 0.45 : 1;
    const count = (n: number) => Math.max(1, Math.round(compact ? n * 0.45 : n));

    let W = 0;
    let H = 0;
    let raf = 0;
    let visible = true;
    type P = { x: number; y: number; r: number; v: number; s: number; a: number; c?: string; rot?: number };
    let parts: P[] = [];
    let shoot: { x: number; y: number; l: number } | null = null;

    const seed = () => {
      parts = [];
      if (canvasMode === "lights")
        for (let i = 0; i < count(70); i++)
          parts.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1, 3.5) * size, v: rnd(0.15, 0.6) * size, s: rnd(0, 6.28), a: rnd(0.3, 0.9) });
      if (canvasMode === "stars")
        for (let i = 0; i < Math.round((W * H) / 6000); i++)
          parts.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.3, 1.4), v: rnd(0.01, 0.04), s: rnd(0, 6.28), a: 1 });
      if (canvasMode === "letters")
        for (let i = 0; i < count(26); i++)
          parts.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(18, 64) * size, v: rnd(0.1, 0.35) * size, s: 0, a: rnd(0.08, 0.24), c: LETTERS[i % LETTERS.length], rot: rnd(-0.3, 0.3) });
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (reduce) draw();
    };

    const crescent = () => {
      const x = W * 0.12, y = H * 0.22, r = Math.min(W, H) * 0.07;
      ctx.save();
      ctx.shadowColor = "rgba(217,180,106,.6)";
      ctx.shadowBlur = 30 * size;
      ctx.fillStyle = "#e8cf98";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "destination-out";
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(x + r * 0.38, y - r * 0.18, r * 0.92, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      if (canvasMode === "lights") {
        for (const p of parts) {
          p.y -= p.v; p.s += 0.01; p.x += Math.sin(p.s) * 0.3 * size;
          if (p.y < -10) { p.y = H + 10; p.x = rnd(0, W); }
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
          g.addColorStop(0, `rgba(240,200,120,${p.a})`);
          g.addColorStop(1, "rgba(240,200,120,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2); ctx.fill();
        }
      }

      if (canvasMode === "stars") {
        for (const p of parts) {
          p.s += p.v;
          ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * Math.abs(Math.sin(p.s))})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
        crescent();
        if (!reduce) {
          if (!shoot && Math.random() < 0.004) shoot = { x: rnd(W * 0.3, W), y: rnd(0, H * 0.4), l: 0 };
          if (shoot) {
            shoot.l += 10 * size;
            const x = shoot.x - shoot.l, y = shoot.y + shoot.l * 0.45;
            const g = ctx.createLinearGradient(x, y, x + 90 * size, y - 40 * size);
            g.addColorStop(0, "rgba(255,255,255,.9)");
            g.addColorStop(1, "rgba(255,255,255,0)");
            ctx.strokeStyle = g; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90 * size, y - 40 * size); ctx.stroke();
            if (shoot.l > W * 0.5) shoot = null;
          }
        }
      }

      if (canvasMode === "letters") {
        ctx.textAlign = "center";
        for (const p of parts) {
          p.y -= p.v;
          if (p.y < -70 * size) { p.y = H + 70 * size; p.x = rnd(0, W); }
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot ?? 0);
          ctx.font = `${p.r}px ${lettersFont}`;
          ctx.fillStyle = `rgba(217,180,106,${p.a})`;
          ctx.fillText(p.c ?? "", 0, 0);
          ctx.restore();
        }
      }
    };

    const loop = () => {
      draw();
      if (visible) raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Stop animating when the hero scrolls out of view.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !reduce) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);

    if (reduce) {
      draw();
      // Redraw once the web font is ready so letters use the right face.
      document.fonts?.ready.then(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [canvasMode, lettersFont, compact]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-hero-theme={variant}
      className={[compact ? "hb-compact" : "", className ?? ""].join(" ").trim() || undefined}
      style={{ ...LAYER, zIndex: 0, overflow: "hidden" }}
    >
      <style>{CSS}</style>

      {showAurora && (
        <div className="hb-aurora" style={LAYER}>
          <i /><i /><i />
        </div>
      )}

      {showGeo && <div ref={geoRef} className="hb-geo" style={LAYER} />}

      {canvasMode && <canvas ref={canvasRef} style={{ ...LAYER, width: "100%", height: "100%" }} />}

      {textShade && (
        <div
          style={{
            ...LAYER,
            background: "linear-gradient(to left, rgba(8,11,10,.55), rgba(8,11,10,.15) 55%, transparent)",
          }}
        />
      )}
    </div>
  );
}
