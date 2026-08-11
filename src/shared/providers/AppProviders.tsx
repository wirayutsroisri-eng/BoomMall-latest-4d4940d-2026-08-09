import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { StyleSheet } from 'react-native';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { useKnowledgeStore } from '@/modules/knowledge/state/knowledge-store';
import { useBoomWalletStore } from '@/modules/wallet/state/boom-wallet-store';
import { useMusicLibraryStore } from '@/modules/music/state/music-library-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { syncModerationContentBlocks } from '@/modules/safety/syncModerationContentBlocks';

type Props = {
  children: React.ReactNode;
};

export function AppProviders({ children }: Props) {
  const hydrateVault = useVaultStore((s) => s.hydrate);
  const hydrateKnowledge = useKnowledgeStore((s) => s.hydrate);
  const hydrateWallet = useBoomWalletStore((s) => s.hydrate);
  const hydrateMusic = useMusicLibraryStore((s) => s.hydrate);
  const hydrateAuth = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateVault();
    void hydrateKnowledge();
    hydrateWallet();
    void hydrateMusic();
    void hydrateAuth();
    void syncModerationContentBlocks();
    const id = setInterval(() => void syncModerationContentBlocks(), 20_000);
    return () => clearInterval(id);
  }, [hydrateVault, hydrateKnowledge, hydrateWallet, hydrateMusic, hydrateAuth]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
