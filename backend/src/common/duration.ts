const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** Durations in config are written like "15m", "12h", "7d" or "900s". */
export const DURATION_PATTERN = /^(\d+)([smhd])$/;

export function durationToMs(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());
  if (!match)
    throw new Error(`Invalid duration "${value}" (expected e.g. 15m, 7d)`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}
