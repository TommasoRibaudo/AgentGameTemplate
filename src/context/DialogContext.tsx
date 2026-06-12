import React, { createContext, useCallback, useContext, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../theme';

export interface DialogButton {
  label: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface DialogOptions {
  title: string;
  message?: string;
  buttons?: DialogButton[];
}

interface DialogContextValue {
  showDialog: (opts: DialogOptions) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<DialogOptions | null>(null);

  const showDialog = useCallback((options: DialogOptions) => { setOpts(options); }, []);

  function dismiss() {
    setOpts(null);
  }

  const buttons: DialogButton[] = opts?.buttons ?? [{ label: 'OK' }];

  return (
    <DialogContext.Provider value={{ showDialog }}>
      {children}
      {opts && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={dismiss}
        >
          <View style={styles.backdrop}>
            <View style={styles.dialog}>
              <Text style={styles.title}>{opts.title}</Text>
              {opts.message ? (
                <Text style={styles.message}>{opts.message}</Text>
              ) : null}
              <View style={styles.btnRow}>
                {buttons.map((btn, i) => {
                  const textColor =
                    btn.style === 'destructive' ? Colors.negative
                    : btn.style === 'cancel'    ? Colors.textSecondary
                    : Colors.accent;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.btn}
                      onPress={() => { dismiss(); btn.onPress?.(); }}
                    >
                      <Text style={[styles.btnText, { color: textColor }]}>{btn.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  btnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
