import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
} from 'react-native';
import { useMetaStore } from '../store/useMetaStore';
import { ACHIEVEMENT_DEFINITIONS } from '../engine/achievements';
import { Colors, FontSize, Spacing, Radius } from '../theme';

export function AchievementsScreen() {
  const unlocked = useMetaStore(s => s.unlocked_achievements);
  const unlockedSet = new Set(unlocked);
  const doneCount = ACHIEVEMENT_DEFINITIONS.filter(d => unlockedSet.has(d.key)).length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {doneCount} / {ACHIEVEMENT_DEFINITIONS.length}
          </Text>
          <Text style={styles.headerSub}>achievements unlocked</Text>
        </View>

        <View style={styles.grid}>
          {ACHIEVEMENT_DEFINITIONS.map(def => {
            const isUnlocked = unlockedSet.has(def.key);
            return (
              <View
                key={def.key}
                style={[styles.card, isUnlocked ? styles.cardUnlocked : styles.cardLocked]}
              >
                <Text style={[styles.icon, !isUnlocked && styles.iconLocked]}>
                  {def.icon}
                </Text>
                <Text style={[styles.name, !isUnlocked && styles.dimText]}>
                  {def.name}
                </Text>
                <Text style={[styles.desc, !isUnlocked && styles.dimText]} numberOfLines={2}>
                  {isUnlocked ? def.description : '???'}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  header:  { alignItems: 'center', paddingVertical: Spacing.md, gap: Spacing.xs },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerSub: { color: Colors.textSecondary, fontSize: FontSize.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  card: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  cardUnlocked: {
    borderColor: Colors.accent,
  },
  cardLocked: {
    borderColor: Colors.border,
    opacity: 0.6,
  },
  icon: {
    fontSize: 28,
    color: Colors.accent,
    marginBottom: Spacing.xs,
  },
  iconLocked: {
    color: Colors.textDim,
  },
  name: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  desc: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
  dimText: {
    color: Colors.textDim,
  },
});
