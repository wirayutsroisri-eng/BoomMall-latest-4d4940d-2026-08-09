import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Conversation } from '@/modules/chat/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';

type Mode = 'call' | 'quotation';

type Props = {
  visible: boolean;
  mode: Mode;
  contacts: Conversation[];
  onClose: () => void;
  onPickForCall?: (peerName: string, type: 'voice' | 'video') => void;
  onPickForQuotation?: (conversationId: string) => void;
};

/** Bottom-sheet-style contact picker used by the [+] menu's "Start Call" and "Smart Quotation" quick actions. */
export function ContactPickerSheet({
  visible,
  mode,
  contacts,
  onClose,
  onPickForCall,
  onPickForQuotation,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <Text style={styles.title}>
            {mode === 'call' ? 'เลือกผู้ติดต่อเพื่อเริ่มการโทร' : 'เลือกผู้ติดต่อเพื่อออกใบเสนอราคา'}
          </Text>
          <FlatList
            data={contacts}
            keyExtractor={(c) => c.id}
            style={styles.list}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Avatar initial={item.peerName.slice(0, 1)} backgroundColor={item.avatarColor} size={44} radius={14} />
                <Text style={styles.name} numberOfLines={1}>{item.peerName}</Text>
                {mode === 'call' ? (
                  <View style={styles.callBtns}>
                    <Pressable
                      style={styles.callBtn}
                      onPress={() => {
                        onClose();
                        onPickForCall?.(item.peerName, 'voice');
                      }}
                    >
                      <Ionicons name="call" size={16} color={colors.brand.ink} />
                    </Pressable>
                    <Pressable
                      style={[styles.callBtn, styles.videoBtn]}
                      onPress={() => {
                        onClose();
                        onPickForCall?.(item.peerName, 'video');
                      }}
                    >
                      <Ionicons name="videocam" size={16} color={colors.text.inverse} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.quoteBtn}
                    onPress={() => {
                      onClose();
                      onPickForQuotation?.(item.id);
                    }}
                  >
                    <Ionicons name="receipt" size={14} color={colors.brand.ink} />
                    <Text style={styles.quoteBtnText}>ออกใบเสนอราคา</Text>
                  </Pressable>
                )}
              </View>
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,20,15,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: '70%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: 12,
  },
  title: {
    fontWeight: '900',
    fontSize: 16,
    color: colors.text.primary,
    marginBottom: 8,
  },
  list: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  name: {
    flex: 1,
    fontWeight: '700',
    color: colors.text.primary,
    fontSize: 14,
  },
  callBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBtn: {
    backgroundColor: colors.brand.ink,
  },
  quoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.brand.primary,
  },
  quoteBtnText: {
    color: colors.brand.ink,
    fontWeight: '800',
    fontSize: 12,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
  },
});
