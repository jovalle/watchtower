/**
 * Design tokens for Watchtower UI
 *
 * Semantic color tokens that provide a Netflix-inspired dark theme
 * optimized for streaming content presentation.
 */

export const tokens = {
  background: {
    primary: '#0a0a0a', // Near-black for main background
    secondary: '#1a1a1a', // Dark gray for secondary surfaces
    elevated: '#262626', // Slightly lighter for elevated elements (cards, modals)
  },
  foreground: {
    primary: '#ffffff', // Pure white for primary text
    secondary: '#d1d5db', // Gray-300 for secondary text
    muted: '#6b7280', // Gray-500 for muted/disabled text
  },
  accent: {
    primary: '#FDBE02', // Mango for primary actions
    hover: '#FFD151', // Lighter mango for hover states
    foreground: '#1C1C1C', // Dark text on mango backgrounds
  },
  border: {
    subtle: '#262626', // Dark border for subtle separation
    emphasis: '#404040', // Lighter border for emphasized boundaries
  },
} as const;

export type TokenPath = keyof typeof tokens;
export type BackgroundToken = keyof typeof tokens.background;
export type ForegroundToken = keyof typeof tokens.foreground;
export type AccentToken = keyof typeof tokens.accent;
export type BorderToken = keyof typeof tokens.border;
