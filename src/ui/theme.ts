import type { CSSProperties } from 'react';

export const ACCENT = '#D97757';

export const DARK_THEME = {
  pageBg: '#1A1A19',
  appBg: '#1A1A19',
  sidebarBg: '#141312',
  cardBg: '#262421',
  // Borderless surfaces separate by fill contrast, so we need a dedicated
  // hover tint (a step above the card) and a recessed input fill.
  hover: '#322F2B',
  inputBg: '#161514',
  ink: '#EAE8E4',
  mutedInk: '#98948E',
  border: '#32302C',
  buttonOffBg: '#262421',
  buttonOffBorder: '#373430',
  buttonOffIcon: '#A7A39D',
  danger: '#A56060',
};

export const LIGHT_THEME = {
  pageBg: '#E4E0D6',
  appBg: '#E4E0D6',
  sidebarBg: '#D8D3C5',
  cardBg: '#F3F1EA',
  hover: '#E7E2D6',
  inputBg: '#EBE7DC',
  ink: '#332E26',
  mutedInk: '#7E7669',
  border: '#D5CFC0',
  buttonOffBg: '#F3F1EA',
  buttonOffBorder: '#CDC6B5',
  buttonOffIcon: '#665F53',
  danger: '#A56060',
};

export type Theme = typeof DARK_THEME;

export function themeVars(theme: Theme): CSSProperties {
  return {
    '--card-bg': theme.cardBg,
    '--hover': theme.hover,
    '--input-bg': theme.inputBg,
    '--theme-ink': theme.ink,
    '--theme-muted-ink': theme.mutedInk,
    '--theme-border': theme.border,
    '--theme-danger': theme.danger,
    '--danger-bg-hover': `color-mix(in oklch, ${theme.danger} 12%, ${theme.appBg})`,
    '--accent': ACCENT,
  } as CSSProperties;
}
