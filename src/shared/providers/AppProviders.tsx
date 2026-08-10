import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { StyleSheet } from 'react-native';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { useKnowledgeStore } from '@/modules/knowledge/state/knowledge-store';

type Props = {
  children: React.ReactNode;
};

export function AppProviders({ children }: Props) {
  const hydrateVault = useVaultStore((s) => s.hydrate);
  const hydrateKnowledge = useKnowledgeStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateVault();
    void hydrateKnowledge();
  }, [hydrateVault, hydrateKnowledge]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
