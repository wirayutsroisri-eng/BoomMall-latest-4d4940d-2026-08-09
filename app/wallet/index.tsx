import { Redirect } from 'expo-router';

/** ตัดหน้ากระเป๋าเหรียญ — ไปตั้งค่าบัญชีแทน */
export default function WalletRoute() {
  return <Redirect href="/wallet/security" />;
}
