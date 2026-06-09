import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootParamList } from '../navigation/types';
import { useRunStore } from '../store/useRunStore';
import { MUSIC_MANIFEST }  from '../manifest/variants/music';
import { SPORTS_MANIFEST } from '../manifest/variants/sports';
import { Colors, FontSize, Spacing, Radius } from '../theme';

type Props = NativeStackScreenProps<RootParamList, 'NewCareer'>;

const VARIANTS = [
  {
    manifest: MUSIC_MANIFEST,
    emoji: '🎵',
    tagline: 'Sign artists, book tours, manage careers.',
  },
  {
    manifest: SPORTS_MANIFEST,
    emoji: '⚽',
    tagline: 'Represent athletes, broker club deals, build a dynasty.',
  },
];

export function NewCareerScreen({ navigation }: Props) {
  const [playerName, setPlayerName] = useState('');
  const startNewRun = useRunStore(s => s.startNewRun);

  function handleStart(idx: number) {
    startNewRun(VARIANTS[idx].manifest, playerName);
    (navigation as any).replace('Run');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.title}>Agent Game</Text>
          <Text style={styles.subtitle}>Choose your career</Text>
        </View>

        <TextInput
          style={styles.nameInput}
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="Manager name"
          placeholderTextColor={Colors.textDim}
          autoCapitalize="words"
          returnKeyType="done"
        />

        <View style={styles.variants}>
          {VARIANTS.map((v, i) => (
            <TouchableOpacity
              key={v.manifest.id}
              style={styles.variantCard}
              onPress={() => handleStart(i)}
              accessibilityRole="button"
              accessibilityLabel={`Start career as ${v.manifest.labels.agent}`}
            >
              <Text style={styles.variantEmoji}>{v.emoji}</Text>
              <View style={styles.variantInfo}>
                <Text style={styles.variantName}>{v.manifest.name}</Text>
                <Text style={styles.variantRole}>{v.manifest.labels.agent}</Text>
                <Text style={styles.variantTagline}>{v.tagline}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => navigation.navigate('Leaderboard')}>
            <Text style={styles.footerLink}>Leaderboard</Text>
          </TouchableOpacity>
          <Text style={styles.footerDivider}>·</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Achievements')}>
            <Text style={styles.footerLink}>Achievements</Text>
          </TouchableOpacity>
          <Text style={styles.footerDivider}>·</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Legacy')}>
            <Text style={styles.footerLink}>History</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    flex: 1,
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  hero: {
    paddingTop: Spacing.xl,
    gap: Spacing.sm,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.huge,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
  },
  variants: {
    gap: Spacing.md,
  },
  nameInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  variantCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  variantEmoji: {
    fontSize: 36,
  },
  variantInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  variantName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  variantRole: {
    color: Colors.accent,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  variantTagline: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  arrow: {
    color: Colors.textDim,
    fontSize: FontSize.xxl,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  footerLink: {
    color: Colors.textDim,
    fontSize: FontSize.sm,
  },
  footerDivider: {
    color: Colors.border,
    fontSize: FontSize.sm,
  },
});
