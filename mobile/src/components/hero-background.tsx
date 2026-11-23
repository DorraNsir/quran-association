import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { HeroTheme } from '@/features/auth/hero-theme';
import { fontFamilies } from '@/theme';

/*
 * The website hero's animated backgrounds, drawn natively — the same six themes, colours and
 * motion as frontend/src/components/website/hero-background.tsx (the web draws them in CSS and
 * canvas; here: views with native gradients, the gold pattern tile, the native animation driver).
 * Decorative only: hidden from screen readers, no touches, still when «تقليل الحركة» is on.
 */

export const HERO_BASE = '#0d1210';
const GOLD = '#d9b46a';
const TILE = 96;
const LETTERS = 'ابتثجحخدذرسشصضطظعغفقكلمنهوي'.split('');

type Size = { w: number; h: number };

/** Small, stable pseudo-random numbers (the same picture on every render). */
function seeded(seed: number) {
  let s = seed;
  return (a: number, b: number) => {
    s = (s * 16807) % 2147483647;
    return a + ((s - 1) / 2147483646) * (b - a);
  };
}

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** 0 → 1 forever (or back and forth); still at 0 when motion is reduced. */
function useLoop(duration: number, reduce: boolean, alternate = false) {
  const value = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    if (reduce) return;
    const forward = Animated.timing(value, { toValue: 1, duration, easing: alternate ? Easing.inOut(Easing.sin) : Easing.linear, useNativeDriver: true });
    const animation = alternate
      ? Animated.loop(Animated.sequence([forward, Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]))
      : Animated.loop(forward);
    animation.start();
    return () => animation.stop();
  }, [value, duration, reduce, alternate]);
  return value;
}

export function HeroBackground({ theme }: { theme: HeroTheme }) {
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const reduce = useReduceMotion();
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  const ready = size.w > 0 && size.h > 0;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      testID={`hero-background-${theme}`}
      style={[StyleSheet.absoluteFill, styles.root]}>
      {ready && (theme === 'geometric' || theme === 'combo') ? <Pattern size={size} reduce={reduce} /> : null}
      {ready && (theme === 'aurora' || theme === 'combo') ? <Aurora size={size} reduce={reduce} /> : null}
      {ready && theme === 'lights' ? <Lights size={size} reduce={reduce} /> : null}
      {ready && theme === 'stars' ? <Stars size={size} reduce={reduce} /> : null}
      {ready && theme === 'letters' ? <Letters size={size} reduce={reduce} /> : null}
    </View>
  );
}

/** «زخارف هندسية»: the gold Islamic tile drifting slowly, brightest near the start side. */
function Pattern({ size, reduce }: { size: Size; reduce: boolean }) {
  const t = useLoop(60_000, reduce);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, TILE] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, TILE * 2] });
  return (
    <>
      <Animated.View
        style={{ position: 'absolute', left: -TILE, top: -TILE * 2, width: size.w + TILE, height: size.h + TILE * 2, transform: [{ translateX }, { translateY }] }}>
        <Image source={require('../../assets/images/hero/pattern-tile.png')} resizeMode="repeat" style={StyleSheet.absoluteFill} />
      </Animated.View>
      {/* the web's radial mask: the pattern fades out towards the edges */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(13,18,16,0) 0%, rgba(13,18,16,0.65) 35%, rgba(13,18,16,1) 75%)' },
        ]}
      />
    </>
  );
}

const BLOBS = [
  { left: -0.1, top: -0.2, width: 0.55, height: 0.7, color: '31,122,69', opacity: 0.75, to: [0.35, 0.25, 1.2], duration: 18_000 },
  { left: 0.3, top: 0.4, width: 0.45, height: 0.6, color: '15,90,90', opacity: 0.75, to: [-0.4, -0.3, 0.9], duration: 22_000 },
  { left: 0.05, top: 0.45, width: 0.35, height: 0.45, color: '138,106,42', opacity: 0.45, to: [0.5, -0.2, 1.3], duration: 26_000 },
] as const;

/** «الشفق المضيء»: three soft green / teal / gold glows moving slowly. */
function Aurora({ size, reduce }: { size: Size; reduce: boolean }) {
  return (
    <>
      {BLOBS.map((b, i) => (
        <Blob key={i} blob={b} size={size} reduce={reduce} />
      ))}
    </>
  );
}

function Blob({ blob: b, size, reduce }: { blob: (typeof BLOBS)[number]; size: Size; reduce: boolean }) {
  const t = useLoop(b.duration, reduce, true);
  const w = b.width * size.w;
  const h = b.height * size.h;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: b.left * size.w,
        top: b.top * size.h,
        width: w,
        height: h,
        opacity: b.opacity,
        backgroundImage: `radial-gradient(ellipse closest-side, rgba(${b.color},0.9) 0%, rgba(${b.color},0.35) 55%, rgba(${b.color},0) 100%)`,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, b.to[0] * w] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, b.to[1] * h] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, b.to[2]] }) },
        ],
      }}
    />
  );
}

/** «الأضواء المتصاعدة»: warm points of light rising like lanterns. */
function Lights({ size, reduce }: { size: Size; reduce: boolean }) {
  const parts = useMemo(() => {
    const rnd = seeded(7);
    return Array.from({ length: 26 }, () => ({ x: rnd(0, size.w), r: rnd(1, 3.5), duration: rnd(22_000, 60_000), offset: rnd(0, 1), a: rnd(0.3, 0.9) }));
  }, [size.w]);
  return (
    <>
      {parts.map((p, i) => (
        <Rising key={i} x={p.x} duration={p.duration} offset={p.offset} height={size.h} reduce={reduce} extent={p.r * 12}>
          <View
            style={{
              width: p.r * 12,
              height: p.r * 12,
              borderRadius: p.r * 6,
              backgroundImage: `radial-gradient(circle closest-side, rgba(240,200,120,${p.a}) 0%, rgba(240,200,120,0) 100%)`,
            }}
          />
        </Rising>
      ))}
    </>
  );
}

/** A child rising from below the bottom to above the top, forever, from its own starting point. */
function Rising({
  x,
  duration,
  offset,
  height,
  extent,
  reduce,
  rotate,
  children,
}: {
  x: number;
  duration: number;
  offset: number;
  height: number;
  extent: number;
  reduce: boolean;
  rotate?: number;
  children: React.ReactNode;
}) {
  const t = useLoop(duration, reduce);
  const progress = useMemo(() => Animated.modulo(Animated.add(t, offset), 1), [t, offset]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height + extent, -extent] });
  return (
    <Animated.View style={{ position: 'absolute', left: x - extent / 2, top: 0, transform: [{ translateY }, { rotate: `${rotate ?? 0}rad` }] }}>
      {children}
    </Animated.View>
  );
}

/** «السماء المرصعة بالنجوم»: twinkling stars and a golden crescent. */
function Stars({ size, reduce }: { size: Size; reduce: boolean }) {
  const groups = [useLoop(2600, reduce, true), useLoop(3400, reduce, true), useLoop(4200, reduce, true)];
  const stars = useMemo(() => {
    const rnd = seeded(11);
    const count = Math.min(140, Math.round((size.w * size.h) / 6000));
    return Array.from({ length: count }, (_, i) => ({ x: rnd(0, size.w), y: rnd(0, size.h), r: rnd(0.4, 1.5), group: i % 3 }));
  }, [size.w, size.h]);
  const r = Math.min(size.w, size.h) * 0.07;
  return (
    <>
      {stars.map((s, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.r * 2,
            height: s.r * 2,
            borderRadius: s.r,
            backgroundColor: '#ffffff',
            opacity: groups[s.group]!.interpolate({ inputRange: [0, 1], outputRange: [0.35 + (i % 5) * 0.1, 1] }),
          }}
        />
      ))}
      {/* the crescent: a golden disc, its inner part covered by the night */}
      <View
        style={{
          position: 'absolute',
          left: size.w * 0.12 - r,
          top: size.h * 0.22 - r,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          backgroundColor: '#e8cf98',
          boxShadow: `0 0 ${Math.round(r * 0.8)}px rgba(217,180,106,0.6)`,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size.w * 0.12 + r * 0.38 - r * 0.92,
          top: size.h * 0.22 - r * 0.18 - r * 0.92,
          width: r * 1.84,
          height: r * 1.84,
          borderRadius: r * 0.92,
          backgroundColor: HERO_BASE,
        }}
      />
    </>
  );
}

/** «الحروف العربية»: golden Arabic letters floating up. */
function Letters({ size, reduce }: { size: Size; reduce: boolean }) {
  const parts = useMemo(() => {
    const rnd = seeded(5);
    return Array.from({ length: 18 }, (_, i) => ({
      x: rnd(0, size.w),
      size: rnd(18, 60),
      duration: rnd(40_000, 90_000),
      offset: rnd(0, 1),
      a: rnd(0.08, 0.24),
      c: LETTERS[(i * 7) % LETTERS.length]!,
      rot: rnd(-0.3, 0.3),
    }));
  }, [size.w]);
  return (
    <>
      {parts.map((p, i) => (
        <Rising key={i} x={p.x} duration={p.duration} offset={p.offset} height={size.h} extent={p.size * 1.4} reduce={reduce} rotate={p.rot}>
          <Animated.Text style={{ fontFamily: fontFamilies.bold, fontSize: p.size, lineHeight: p.size * 1.4, color: GOLD, opacity: p.a }}>{p.c}</Animated.Text>
        </Rising>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: HERO_BASE, overflow: 'hidden' },
});
