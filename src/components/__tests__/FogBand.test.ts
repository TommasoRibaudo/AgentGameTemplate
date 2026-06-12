import { getFogEstimateTextColor } from '../fog-band-colors';
import { formatFogStatDisplay } from '../fog-band-display';
import { FoggedStat } from '../../types/client';

function makeStat(observed_min: number, observed_max: number): FoggedStat {
  return {
    true_value: Math.round((observed_min + observed_max) / 2),
    observed_min,
    observed_max,
    scouting_invested: 0,
  };
}

function brightness(hex: string): number {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return r + g + b;
}

describe('getFogEstimateTextColor', () => {
  it('makes wider fog estimates gray and narrower estimates whiter', () => {
    const foggy = getFogEstimateTextColor(makeStat(10, 90));
    const clear = getFogEstimateTextColor(makeStat(49, 51));

    expect(brightness(foggy)).toBeLessThan(brightness(clear));
  });

  it('uses the same confidence scale for custom track ranges', () => {
    const foggy = getFogEstimateTextColor(makeStat(20, 80), 0, 100);
    const clear = getFogEstimateTextColor(makeStat(45, 55), 0, 100);

    expect(foggy).toMatch(/^#[0-9a-f]{6}$/);
    expect(clear).toMatch(/^#[0-9a-f]{6}$/);
    expect(foggy).not.toBe(clear);
  });
});

describe('formatFogStatDisplay', () => {
  it('shows an exact known stat as a plain number', () => {
    expect(formatFogStatDisplay(makeStat(72, 72))).toEqual({
      label: '72',
      accessibilityValue: '72',
      isEstimate: false,
    });
  });

  it('keeps narrow non-exact ranges marked as estimates', () => {
    expect(formatFogStatDisplay(makeStat(71, 73))).toEqual({
      label: '~72',
      accessibilityValue: '~72',
      isEstimate: true,
    });
  });

  it('marks wider ranges as estimates', () => {
    expect(formatFogStatDisplay(makeStat(60, 80))).toEqual({
      label: '~60-80',
      accessibilityValue: '~60-80',
      isEstimate: true,
    });
  });
});
