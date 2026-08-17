import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { apiDeleteAccount } from '@/modules/social/data/socialApi';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { useActivityStore } from '@/modules/account/state/activity-store';
import { useMusicLibraryStore } from '@/modules/music/state/music-library-store';
import { useShopActivityStore } from '@/modules/shop/state/shop-activity-store';

async function runDeleteAccount() {
  await apiDeleteAccount();
  await useAuthStore.getState().clearSession();
  useLoyaltyStore.getState().deleteAccount();
  useModerationStore.setState({ blockedUserIds: [], reports: [] });
  useActivityStore.getState().clearAll();
  useMusicLibraryStore.getState().clearWatchHistory();
  useShopActivityStore.getState().clearBrowsable();
  await AsyncStorage.multiRemove(['boommall-apple-user-id', 'boommall-moderation-v1']);
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  Alert.alert('ลบบัญชีแล้ว', 'บัญชีและข้อมูลที่เกี่ยวข้องถูกลบจากเซิร์ฟเวอร์และเครื่องนี้แล้ว');
  router.replace('/(tabs)/profile');
}

/** Guideline 5.1.1v — confirm twice, then DELETE /api/v1/auth/me. */
export function confirmDeleteAccount() {
  Alert.alert(
    'ลบบัญชีและข้อมูลทั้งหมด?',
    'จะลบโปรไฟล์ การล็อกอิน โพสต์ คอมเมนต์ การติดตาม และข้อมูลบัญชีบนเครื่องนี้ ทำแล้วกู้คืนไม่ได้',
    [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบทั้งหมด',
        style: 'destructive',
        onPress: () => {
          Alert.alert('ยืนยันอีกครั้ง', 'ต้องการลบบัญชี BoomMall และข้อมูลทั้งหมดจริงหรือไม่', [
            { text: 'ยกเลิก', style: 'cancel' },
            {
              text: 'ลบถาวร',
              style: 'destructive',
              onPress: () => {
                void runDeleteAccount().catch((e: unknown) => {
                  Alert.alert(
                    'ลบบัญชีไม่สำเร็จ',
                    e instanceof Error ? e.message : 'ต้องเข้าสู่ระบบและเชื่อมเซิร์ฟเวอร์ก่อนลบ',
                  );
                });
              },
            },
          ]);
        },
      },
    ],
  );
}
