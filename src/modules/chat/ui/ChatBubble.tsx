import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage } from '@/modules/chat/domain/types';
import { CURRENT_USER_ID } from '@/modules/chat/data/mockChatData';
import { colors } from '@/shared/theme/colors';

type Props = {
  message: ChatMessage;
  onPay?: (quotationId: string) => void;
  onConvertProduct?: (productCardId: string) => void;
};

export function ChatBubble({ message, onPay, onConvertProduct }: Props) {
  const mine = message.senderId === CURRENT_USER_ID;

  if (message.kind === 'product' && message.product) {
    const p = message.product;
    return (
      <View style={[styles.quoteWrap, mine ? styles.mineAlign : styles.peerAlign]}>
        <Text style={styles.quoteEyebrow}>Interactive Product Card</Text>
        <Text style={styles.quoteTitle}>{p.title}</Text>
        <Text style={styles.quoteDesc}>SKU {p.sku}</Text>
        <Text style={styles.quoteAmount}>฿{p.price.toLocaleString('th-TH')}</Text>
        <Pressable
          style={styles.payBtn}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onConvertProduct?.(p.id);
          }}
        >
          <Text style={styles.payText}>แปลงเป็นสลิปชำระเงิน</Text>
        </Pressable>
      </View>
    );
  }

  if (message.kind === 'quotation' && message.quotation) {
    const q = message.quotation;
    const paid = q.status === 'paid';
    return (
      <View style={[styles.quoteWrap, mine ? styles.mineAlign : styles.peerAlign]}>
        <Text style={styles.quoteEyebrow}>In-Chat Checkout · Payment Slip</Text>
        <Text style={styles.quoteTitle}>{q.title}</Text>
        <Text style={styles.quoteDesc}>{q.description}</Text>
        <Text style={styles.quoteAmount}>฿{q.amount.toLocaleString('th-TH')}</Text>
        <Text style={styles.quoteExpiry}>หมดอายุ {q.expiresAt}</Text>
        <Pressable
          disabled={paid}
          style={[styles.payBtn, paid && styles.payBtnDone]}
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onPay?.(q.id);
          }}
        >
          <Text style={[styles.payText, paid && styles.payTextDone]}>
            {paid ? 'ชำระแล้ว ✓ ปิดการขาย' : 'One-Tap Payment'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (message.kind === 'content_ref' && message.contentRef) {
    const ref = message.contentRef;
    return (
      <View style={[styles.contentRefWrap, mine ? styles.mineAlign : styles.peerAlign]}>
        <Text style={styles.contentRefEyebrow}>สอบถามจากคอนเทนต์บน Feed</Text>
        <View style={styles.contentRefRow}>
          {ref.imageUri ? (
            <Image source={{ uri: ref.imageUri }} style={styles.contentRefThumb} />
          ) : (
            <LinearGradient colors={ref.gradient} style={styles.contentRefThumb} />
          )}
          <View style={styles.contentRefBody}>
            <View style={styles.contentRefTier}>
              <Text style={styles.contentRefTierText}>{ref.tier}</Text>
            </View>
            <Text style={styles.contentRefTitle} numberOfLines={2}>{ref.title}</Text>
            <Text style={styles.contentRefSub} numberOfLines={2}>{ref.subtitle}</Text>
            <Text style={styles.contentRefPrice}>
              ฿{ref.price.toLocaleString('th-TH')}
            </Text>
          </View>
        </View>
        <View style={styles.contentRefFooter}>
          <Ionicons name="link" size={12} color={colors.brand.primary} />
          <Text style={styles.contentRefFooterText}>{ref.authorHandle}</Text>
        </View>
      </View>
    );
  }

  if (message.kind === 'voice' && message.audioUri) {
    return <VoiceBubble message={message} mine={mine} />;
  }

  if (message.kind === 'image' && message.imageUri) {
    return (
      <View style={[styles.imageWrap, mine ? styles.mineAlign : styles.peerAlign]}>
        <Image source={{ uri: message.imageUri }} style={styles.image} resizeMode="cover" />
        <View style={styles.metaRow}>
          <Text style={[styles.time, mine && styles.timeMine]}>{message.createdAt}</Text>
          {mine ? (
            <Text style={styles.readReceipt}>{message.readAt ?? 'ส่งแล้ว'}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.peer]}>
      <Text style={[styles.text, mine && styles.textMine]}>{message.text}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.time, mine && styles.timeMine]}>{message.createdAt}</Text>
        {mine ? (
          <Text style={styles.readReceipt}>{message.readAt ?? 'ส่งแล้ว'}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** WeChat/LINE-style voice message bubble — tap to play/pause, decorative waveform, mm:ss duration. */
function VoiceBubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const player = useAudioPlayer(message.audioUri ?? null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const toggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const duration = message.durationSec ?? Math.round(status.duration) ?? 0;
  const bars = React.useMemo(
    () => Array.from({ length: 18 }, (_, i) => 6 + ((i * 37 + message.id.length * 13) % 16)),
    [message.id],
  );

  return (
    <View style={[styles.voiceWrap, mine ? styles.mine : styles.peer]}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        style={[styles.voicePlayBtn, mine ? styles.voicePlayBtnMine : styles.voicePlayBtnPeer]}
      >
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={16}
          color={mine ? colors.brand.ink : colors.text.inverse}
        />
      </Pressable>
      <View style={styles.waveform}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={[
              styles.waveBar,
              { height: h },
              mine ? styles.waveBarMine : styles.waveBarPeer,
            ]}
          />
        ))}
      </View>
      <Text style={[styles.voiceDuration, mine && styles.textMine]}>{duration}"</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 4,
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand.primary,
    borderBottomRightRadius: 6,
  },
  peer: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface.card,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  text: {
    color: colors.text.primary,
    fontSize: 15,
    lineHeight: 20,
  },
  textMine: {
    color: colors.brand.ink,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  time: {
    fontSize: 10,
    color: colors.text.muted,
  },
  timeMine: {
    color: 'rgba(7,20,15,0.55)',
  },
  readReceipt: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(7,20,15,0.55)',
  },
  quoteWrap: {
    maxWidth: '86%',
    marginVertical: 8,
    backgroundColor: colors.brand.ink,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.brand.primary,
  },
  mineAlign: { alignSelf: 'flex-end' },
  peerAlign: { alignSelf: 'flex-start' },
  imageWrap: {
    maxWidth: '68%',
    marginVertical: 4,
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.surface.card,
  },
  quoteEyebrow: {
    color: colors.brand.primary,
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 4,
  },
  quoteTitle: {
    color: colors.text.inverse,
    fontWeight: '900',
    fontSize: 16,
  },
  quoteDesc: {
    color: colors.text.muted,
    marginTop: 4,
    marginBottom: 10,
  },
  quoteAmount: {
    color: colors.brand.primary,
    fontSize: 26,
    fontWeight: '900',
  },
  quoteExpiry: {
    color: colors.text.muted,
    fontSize: 12,
    marginBottom: 12,
  },
  payBtn: {
    backgroundColor: colors.brand.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  payBtnDone: {
    backgroundColor: 'rgba(0,214,143,0.18)',
  },
  payText: {
    color: colors.brand.ink,
    fontWeight: '900',
  },
  payTextDone: {
    color: colors.brand.primary,
  },
  voiceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 150,
    maxWidth: '72%',
  },
  voicePlayBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayBtnMine: {
    backgroundColor: 'rgba(7,20,15,0.18)',
  },
  voicePlayBtnPeer: {
    backgroundColor: colors.brand.primaryDark,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 24,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  waveBarMine: {
    backgroundColor: 'rgba(7,20,15,0.5)',
  },
  waveBarPeer: {
    backgroundColor: colors.text.muted,
  },
  voiceDuration: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
  contentRefWrap: {
    maxWidth: '88%',
    marginVertical: 8,
    backgroundColor: colors.surface.card,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.brand.primary,
  },
  contentRefEyebrow: {
    color: colors.brand.primaryDark,
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 8,
  },
  contentRefRow: {
    flexDirection: 'row',
    gap: 10,
  },
  contentRefThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.brand.ink,
  },
  contentRefBody: {
    flex: 1,
    justifyContent: 'center',
  },
  contentRefTier: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand.ink,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  contentRefTierText: {
    color: colors.brand.primary,
    fontWeight: '900',
    fontSize: 9,
  },
  contentRefTitle: {
    color: colors.text.primary,
    fontWeight: '900',
    fontSize: 14,
  },
  contentRefSub: {
    color: colors.text.secondary,
    fontSize: 11,
    marginTop: 2,
  },
  contentRefPrice: {
    color: colors.brand.primaryDark,
    fontWeight: '900',
    fontSize: 15,
    marginTop: 4,
  },
  contentRefFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  contentRefFooterText: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: '600',
  },
});
