/**
 * Taiwan Kids Atlas — theme tokens, ported from the original web prototype
 * (TaiwanKidsAtlas/src/constants/theme.ts) and the kid-friendly brand.
 */
export const theme = {
  colors: {
    bg: '#F6F9FC',
    surface: '#FFFFFF',
    elev1: '#F2F6FB',
    elev2: '#EEF3F9',
    text: '#0F172A',
    muted: '#5D6B82',
    border: '#E2E8F0',
    chip: '#F2F6FB',
    primary: '#5D6B82',
    success: '#2ECC71',
    danger: '#FF6B6B',
    warning: '#FFB020',
    gradientA: 'rgba(124,92,255,0.18)',
    gradientB: 'rgba(94,227,255,0.18)',
    dark: '#26292f',
  },
  spacing: {
    s1: 4,
    s2: 8,
    s3: 12,
    s4: 16,
    s5: 20,
    s6: 24,
  },
  radius: {
    lg: 24,
    md: 16,
    sm: 12,
    xs: 8,
    full: 9999,
  },
  shadows: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 5,
    },
  },
} as const

// Minimum touch target for kids and parents (platform-independent, in dp).
export const TOUCH_TARGET = 44
