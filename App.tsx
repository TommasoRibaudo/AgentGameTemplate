import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useHydrateStores, useAutoSave } from './src/store/persistence';
import { useIsRunActive } from './src/store/useRunStore';
import { DialogProvider } from './src/context/DialogContext';
import { Colors } from './src/theme';

function AppRoot() {
  const { hydrating } = useHydrateStores();
  useAutoSave();
  const isRunActive = useIsRunActive();

  if (hydrating) {
    // Blank dark screen while AsyncStorage loads. avoids flash of wrong route.
    return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
  }

  return <AppNavigator initialRoute={isRunActive ? 'Run' : 'NewCareer'} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <DialogProvider>
          <AppRoot />
          <StatusBar style="light" />
        </DialogProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
