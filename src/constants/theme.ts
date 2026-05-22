export const colors = {
  background: {
    page: '#080d1a',
    surface: '#0d1526',
  },
  accent: {
    cyan: '#00d4ff',
    gold: '#f5a623',
  },
  text: {
    primary: '#ffffff',
    secondary: '#7eb8cc',
    muted: '#2a4a5a',
  },
  border: {
    cyan: 'rgba(0, 212, 255, 0.4)',
    cyanActive: 'rgba(0, 212, 255, 0.8)',
    gold: 'rgba(245, 166, 35, 0.5)',
    goldActive: 'rgba(245, 166, 35, 0.9)',
  },
} as const;

export const shadows = {
  cyanGlow: {
    shadowColor: '#00d4ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  cyanGlowStrong: {
    shadowColor: '#00d4ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 8,
  },
  goldGlow: {
    shadowColor: '#f5a623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const animation = {
  fast: 150,
  standard: 300,
} as const;

export const theme = {
  colors,
  shadows,
  spacing,
  animation,
} as const;

export type Theme = typeof theme;

export const MaxContentWidth = 800;
