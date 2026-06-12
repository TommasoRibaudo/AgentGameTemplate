import React from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { Colors, formatMoney } from '../theme';

type DeltaKind = 'money' | 'number';

export function DeltaText({
  value,
  kind = 'number',
  label,
  style,
}: {
  value: number;
  kind?: DeltaKind;
  label?: string;
  style?: TextStyle | TextStyle[];
}) {
  const formatted = formatSignedValue(value, kind);
  const suffix = label ? ` ${label}` : '';

  return (
    <Text style={[style, deltaStyle(value)]}>
      {formatted}{suffix}
    </Text>
  );
}

function formatSignedValue(value: number, kind: DeltaKind): string {
  if (value === 0) return '—';
  const sign = value > 0 ? '+' : '-';
  const abs = Math.abs(value);
  return kind === 'money' ? `${sign}${formatMoney(abs)}` : `${sign}${abs}`;
}

export function deltaStyle(value: number): TextStyle | undefined {
  if (value > 0) return styles.positive;
  if (value < 0) return styles.negative;
  return undefined;
}

const styles = StyleSheet.create({
  positive: {
    color: Colors.positive,
  },
  negative: {
    color: Colors.negative,
  },
});
