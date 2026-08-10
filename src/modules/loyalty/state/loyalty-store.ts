import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DigitalWarranty, VipProfile } from '@/modules/knowledge/domain/types';

type LoyaltyState = {
  profile: VipProfile;
  warranties: DigitalWarranty[];
  updateProfile: (
    patch: Partial<Pick<VipProfile, 'displayName' | 'handle' | 'bio' | 'avatarUri' | 'coverUri'>>,
  ) => void;
};

export const useLoyaltyStore = create<LoyaltyState>()(
  persist(
    (set) => ({
      profile: {
        displayName: 'Boom Rider',
        handle: '@boom_chanthaburi',
        bio: 'รักการซ่อม รักการแต่ง 🔧⚡ ส่งตรงจากจันทบุรี ทักแชตได้ตลอดครับ',
        avatarUri: null,
        coverUri: null,
        loyaltyTier: 'Boom VIP',
        points: 12840,
        technicianBadge: 'ช่างทองคำ · Boom EV Certified',
        shopVerified: true,
        followingCount: 128,
        followersCount: 45600,
        likesCount: 892000,
      },
      warranties: [
        {
          id: 'w-1',
          productName: 'LiFePO4 60V 32Ah Smart BMS Pack',
          serialNo: 'BEV-CTI-60-32-00421',
          shopName: 'Boom EV Shop Chanthaburi',
          shopVerified: true,
          technicianRank: 'ช่างเอิร์ธ · ยศช่างทองคำ',
          issuedAt: '2026-05-12',
          expiresAt: '2029-05-12',
          coverage: 'เซลล์ + BMS + ติดตั้ง (ไม่รวมอุบัติเหตุ)',
        },
        {
          id: 'w-2',
          productName: 'CNC Front Brake Master',
          serialNo: 'BEV-CNC-BRK-1188',
          shopName: 'Boom EV Shop Chanthaburi',
          shopVerified: true,
          technicianRank: 'ช่างมิ้นท์ · ยศช่างเงิน',
          issuedAt: '2026-07-01',
          expiresAt: '2027-07-01',
          coverage: 'รอยรั่ว/ซีล · เปลี่ยนอะไหล่ที่ร้าน',
        },
      ],
      updateProfile: (patch) =>
        set((state) => ({ profile: { ...state.profile, ...patch } })),
    }),
    {
      name: 'boommall-profile-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ profile: state.profile }),
    },
  ),
);
