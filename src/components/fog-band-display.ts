import { FoggedStat } from '../types/client';

export interface FogStatDisplay {
  label: string;
  accessibilityValue: string;
  isEstimate: boolean;
}

export function formatFogStatDisplay(stat: FoggedStat): FogStatDisplay {
  const span = stat.observed_max - stat.observed_min;

  if (span === 0) {
    const value = String(Math.round(stat.observed_min));
    return { label: value, accessibilityValue: value, isEstimate: false };
  }

  const mid = Math.round((stat.observed_min + stat.observed_max) / 2);
  const value = span <= 2
    ? `~${mid}`
    : `~${Math.round(stat.observed_min)}-${Math.round(stat.observed_max)}`;

  return {
    label: value,
    accessibilityValue: value,
    isEstimate: true,
  };
}
