/** Spacing scale (multiples of 4, like Tailwind). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Web --radius is 0.625rem (10px); the derived radii use the same ratios. */
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  full: 999,
} as const;

/** Minimum touch target (Apple HIG 44pt / Material 48dp). */
export const touchTarget = 48;
