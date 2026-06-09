export const Colors = {
  bg:            '#0F0F13',
  surface:       '#1A1A22',
  surfaceRaised: '#222230',
  border:        '#2E2E3E',
  accent:        '#7C6FEE',
  positive:      '#4DB87A',
  negative:      '#E05555',
  warning:       '#F0A833',
  crisis:        '#C0392B',
  textPrimary:   '#F0EFF8',
  textSecondary: '#8A8A9A',
  textDim:       '#4A4A5A',
  fog:           '#252535',
  tabBar:        '#12121A',
} as const;

export const ArcColors: Record<string, string> = {
  rising:   Colors.positive,
  peak:     Colors.warning,
  declining:Colors.textSecondary,
};

export const SeverityColors: Record<string, string> = {
  minor:  Colors.warning,
  major:  Colors.negative,
  crisis: Colors.crisis,
};

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
} as const;

export const FontSize = {
  xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, huge: 32,
} as const;

export const Radius = {
  sm: 4, md: 8, lg: 12,
} as const;

export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${abs}`;
}

export function formatDelta(n: number, prefix = ''): string {
  if (n === 0) return '—';
  return `${n > 0 ? '+' : ''}${prefix}${n}`;
}

// 1 turn ≈ 1 month. Displays as months (< 12) or years (≥ 12, rounded to nearest 0.5).
export function formatDuration(turns: number): string {
  if (turns < 12) return turns === 1 ? '1 month' : `${turns} months`;
  const years = Math.round((turns / 12) * 2) / 2;
  return years === 1 ? '1 year' : `${years} years`;
}
