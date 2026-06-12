import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing, Radius } from '../theme';

interface TutorialModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function TutorialModal({ visible, onAccept, onDecline }: TutorialModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.from}>Dev Reyes · Friend</Text>
          <Text style={styles.message}>
            {"Yo, I heard you're finally starting an agency.\n\nYou've seen me perform. You know what I can do.\n\nSign me — seriously. I'll grind. I just need someone in my corner."}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
              <Text style={styles.declineText}>Not right now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
              <Text style={styles.acceptText}>Sign Dev →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    borderColor: Colors.warning,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  from: {
    color: Colors.warning,
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  message: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  declineBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  declineText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  acceptBtn: {
    flex: 2,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.warning,
  },
  acceptText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
