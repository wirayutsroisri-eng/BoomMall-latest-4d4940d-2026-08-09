import { Redirect } from 'expo-router';
import { BoomWalletScreen } from '@/modules/wallet/ui/BoomWalletScreen';
import { ENABLE_BOOM_WALLET_UI } from '@/shared/compliance/appStoreGates';

export default function WalletRoute() {
  if (!ENABLE_BOOM_WALLET_UI) {
    return <Redirect href="/(tabs)/profile" />;
  }
  return <BoomWalletScreen />;
}
