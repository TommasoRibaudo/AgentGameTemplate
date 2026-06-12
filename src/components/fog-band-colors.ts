import { FoggedStat } from '../types/client';

const FOGGY_TEXT_COLOR = '#8B8C98';
const KNOWN_TEXT_COLOR = '#F4F3FA';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function mixHexColor(from: string, to: string, amount: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const mix = clamp01(amount);

  return rgbToHex({
    r: Math.round(start.r + (end.r - start.r) * mix),
    g: Math.round(start.g + (end.g - start.g) * mix),
    b: Math.round(start.b + (end.b - start.b) * mix),
  });
}

export function getFogEstimateTextColor(stat: FoggedStat, trackMin = 0, trackMax = 100): string {
  const range = Math.max(trackMax - trackMin, 1);
  const span = Math.max(stat.observed_max - stat.observed_min, 0);
  const confidence = 1 - clamp01(span / range);
  return mixHexColor(FOGGY_TEXT_COLOR, KNOWN_TEXT_COLOR, confidence);
}
