import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, Pressable as GHPressable } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { deliveryStatusLabel } from '@/modules/chat/domain/message-sync';
import type { ChatMessage, OrderSnapshotCard, ProductCard } from '@/modules/chat/domain/types';
import { OrderSnapshotCard as OrderSnapshotView } from '@/modules/chat/ui/OrderSnapshotCard';
import { formatFileSize, quotePreviewLabel } from '@/modules/chat/domain/quotePreview';
import { messageImageUris } from '@/modules/chat/domain/selectChatImages';
import { isCurrentChatUser } from '@/modules/chat/data/chatRealtimeApi';
import { colors } from '@/shared/theme/colors';
import { Avatar } from '@/shared/components/Avatar';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { formatTHB, hashSeed, variantImageUri } from '@/modules/shop/domain/product-display';

type Face = {
  uri?: string | null;
  name: string;
  color: string;
};

type Props = {
  message: ChatMessage;
  onPay?: (quotationId: string) => void;
  onConvertProduct?: (productCardId: string) => void;
  /** LINE/WeChat: open fullscreen media viewer for this image */
  onPressImage?: (messageId: string, uriIndex?: number) => void;
  onSelectProductSpecs?: (product: ChatMessage['product']) => void;
  onBuyProduct?: (product: ChatMessage['product']) => void;
  onOpenOrder?: (order: OrderSnapshotCard) => void;
  /** WeChat อ้างอิง — swipe left */
  onQuote?: (message: ChatMessage) => void;
  onLongPress?: (message: ChatMessage) => void;
  selectMode?: boolean;
  selected?: boolean;
  selectedImageIndexes?: ReadonlySet<number>;
  onToggleSelect?: (message: ChatMessage) => void;
  onToggleImage?: (message: ChatMessage, index: number) => void;
  peerFace?: Face;
  myFace?: Face;
  onRetryFailed?: (message: ChatMessage) => void;
};

const SPRING = { damping: 22, stiffness: 280, mass: 0.7 };
const QUOTE_SWIPE = 56;
const SCREEN_W = Dimensions.get('window').width;
const IMAGE_MAX_W = Math.min(240, SCREEN_W * 0.62);
const IMAGE_MAX_H = 320;

function SwipeToQuote({
  enabled,
  onQuote,
  onLongPress,
  onPress,
  children,
}: {
  enabled: boolean;
  onQuote: () => void;
  onLongPress?: () => void;
  onPress?: (x: number, y: number) => void;
  align: 'start' | 'end';
  children: React.ReactNode;
}) {
  const x = useSharedValue(0);
  const onQuoteRef = useRef(onQuote);
  onQuoteRef.current = onQuote;
  const onLongRef = useRef(onLongPress);
  onLongRef.current = onLongPress;
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const fireQuote = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onQuoteRef.current();
  }, []);

  const fireLong = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongRef.current?.();
  }, []);

  const firePress = useCallback((px: number, py: number) => {
    onPressRef.current?.(px, py);
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .maxPointers(1)
        .activeOffsetX([-18, 24])
        .failOffsetY([-16, 16])
        .onUpdate((e) => {
          'worklet';
          x.value = Math.max(-QUOTE_SWIPE, Math.min(0, e.translationX));
        })
        .onEnd((e) => {
          'worklet';
          const shouldQuote = x.value < -40 || e.velocityX < -700;
          if (shouldQuote) runOnJS(fireQuote)();
          x.value = withSpring(0, SPRING);
        }),
    [enabled, fireQuote, x],
  );

  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(Boolean(onLongPress))
        .minDuration(380)
        .maxDistance(16)
        .onStart(() => {
          runOnJS(fireLong)();
        }),
    [fireLong, onLongPress],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(Boolean(onPress))
        .onEnd((e, success) => {
          if (success) runOnJS(firePress)(e.x, e.y);
        }),
    [firePress, onPress],
  );

  const composed = useMemo(
    () => Gesture.Race(longPress, pan, tap),
    [longPress, pan, tap],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const hintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-QUOTE_SWIPE, -12, 0], [1, 0.45, 0]),
    transform: [{ scale: interpolate(x.value, [-QUOTE_SWIPE, 0], [1, 0.7]) }],
  }));

  if (!enabled && !onLongPress && !onPress) return <>{children}</>;

  return (
    <View style={styles.swipeWrap}>
      {enabled ? (
        <Animated.View style={[styles.quoteHint, hintStyle]} pointerEvents="none">
          <Ionicons name="chatbox-ellipses-outline" size={18} color="#FFFFFF" />
        </Animated.View>
      ) : null}
      <GestureDetector gesture={composed}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

function MessageFace({ face }: { face: Face }) {
  return (
    <Avatar
      uri={face.uri}
      initial={face.name.slice(0, 1)}
      backgroundColor={face.color}
      size={36}
      radius={18}
      borderWidth={0}
    />
  );
}

function QuoteHeader({ mine, quote }: { mine: boolean; quote: NonNullable<ChatMessage['quote']> }) {
  const snippet = quotePreviewLabel(quote);
  return (
    <View style={[styles.quoteHeader, mine ? styles.quoteHeaderMine : styles.quoteHeaderPeer]}>
      <Avatar
        uri={quote.senderAvatarUri}
        initial={(quote.senderName ?? '?').slice(0, 1)}
        backgroundColor={quote.senderAvatarColor ?? colors.brand.primary}
        size={28}
        radius={14}
        borderWidth={0}
      />
      <View style={styles.quoteHeaderBody}>
        <Text style={[styles.quoteHeaderName, mine && styles.quoteHeaderNameMine]} numberOfLines={1}>
          {quote.senderName || 'ข้อความ'}
        </Text>
        <Text style={[styles.quoteHeaderSnippet, mine && styles.quoteHeaderSnippetMine]} numberOfLines={2}>
          {snippet}
        </Text>
      </View>
      {quote.imageUri ? (
        <Image source={{ uri: quote.imageUri }} style={styles.quoteHeaderThumb} />
      ) : null}
    </View>
  );
}

function ReceiptMark({
  message,
  onRetry,
  style,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  style?: object;
}) {
  const sending = message.deliveryStatus === 'sending';
  const failed = message.deliveryStatus === 'failed';
  const label = failed ? 'ส่งอีกครั้ง' : deliveryStatusLabel(message.deliveryStatus, message.readAt);
  return (
    <Pressable disabled={!failed} onPress={failed ? onRetry : undefined} hitSlop={8}>
      <View style={styles.receiptRow}>
        {sending ? <Ionicons name="time-outline" size={11} color={colors.text.muted} /> : null}
        <Text style={[style, failed && styles.receiptFailed]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function SideMeta({
  message,
  mine,
  onRetry,
}: {
  message: ChatMessage;
  mine: boolean;
  onRetry?: () => void;
}) {
  return (
    <View style={[styles.sideMeta, mine ? styles.sideMetaMine : styles.sideMetaPeer]}>
      {message.isFavorite ? <Ionicons name="cube" size={11} color={colors.text.muted} /> : null}
      {message.isReminded ? (
        <Ionicons name="notifications" size={11} color={colors.text.muted} />
      ) : null}
      {mine ? <ReceiptMark message={message} onRetry={onRetry} style={styles.sideRead} /> : null}
      <Text style={styles.sideTime}>{message.createdAt}</Text>
    </View>
  );
}

const ALBUM_GAP = 2;

function albumFrame(count: number) {
  const n = Math.min(4, Math.max(1, count));
  const w = IMAGE_MAX_W;
  if (n === 1) return { w, h: IMAGE_MAX_W };
  if (n === 2) {
    const tile = (w - ALBUM_GAP) / 2;
    return { w, h: tile };
  }
  if (n === 3) {
    const leftW = Math.round((w - ALBUM_GAP) * 0.56);
    return { w, h: leftW };
  }
  const tile = (w - ALBUM_GAP) / 2;
  return { w, h: tile * 2 + ALBUM_GAP };
}

function hitAlbumIndex(count: number, x: number, y: number) {
  const n = Math.min(4, Math.max(1, count));
  const { w, h } = albumFrame(n);
  if (n === 1) return 0;
  if (n === 2) return x < w / 2 ? 0 : 1;
  if (n === 3) {
    const leftW = Math.round((w - ALBUM_GAP) * 0.56);
    if (x < leftW) return 0;
    return y < h / 2 ? 1 : 2;
  }
  const col = x < w / 2 ? 0 : 1;
  const row = y < h / 2 ? 0 : 1;
  return row * 2 + col;
}

const SELECT_GREEN = '#07C160';
const EMPTY_INDEXES: ReadonlySet<number> = new Set();

function SelectMark({ selected }: { selected: boolean }) {
  return (
    <View style={styles.tileCheck} pointerEvents="none">
      <View style={[styles.tileCheckCircle, selected && styles.tileCheckCircleOn]}>
        {selected ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
      </View>
    </View>
  );
}

function AlbumTile({
  uri,
  width,
  height,
  round,
  selectMode,
  selected,
  onPress,
}: {
  uri: string;
  width: number;
  height: number;
  round?: {
    tl?: boolean;
    tr?: boolean;
    bl?: boolean;
    br?: boolean;
  };
  selectMode?: boolean;
  selected?: boolean;
  onPress?: () => void;
}) {
  const radius = 12;
  const radii = {
    borderTopLeftRadius: round?.tl ? radius : 0,
    borderTopRightRadius: round?.tr ? radius : 0,
    borderBottomLeftRadius: round?.bl ? radius : 0,
    borderBottomRightRadius: round?.br ? radius : 0,
  };
  const img = (
    <Image
      source={{ uri }}
      style={{ width, height, backgroundColor: '#DDD', ...radii }}
      resizeMode="cover"
    />
  );
  if (!selectMode) return img;
  return (
    <Pressable onPress={onPress} style={{ width, height }}>
      {img}
      <SelectMark selected={Boolean(selected)} />
    </Pressable>
  );
}

function ImageAlbum({
  uris,
  selectMode,
  selectedIndexes,
  onToggleImage,
}: {
  uris: string[];
  selectMode?: boolean;
  selectedIndexes?: ReadonlySet<number>;
  onToggleImage?: (index: number) => void;
}) {
  const shown = uris.slice(0, 4);
  const n = shown.length;
  const { w } = albumFrame(n);
  const picked = selectedIndexes ?? EMPTY_INDEXES;
  const tileProps = (index: number) => ({
    selectMode,
    selected: picked.has(index),
    onPress: () => onToggleImage?.(index),
  });

  if (n === 1) {
    if (!selectMode) return <ChatImage uri={shown[0]} />;
    return (
      <Pressable onPress={() => onToggleImage?.(0)}>
        <ChatImage uri={shown[0]} />
        <SelectMark selected={picked.has(0)} />
      </Pressable>
    );
  }

  if (n === 2) {
    const tile = (w - ALBUM_GAP) / 2;
    return (
      <View style={[styles.album, { width: w }]}>
        <AlbumTile uri={shown[0]} width={tile} height={tile} round={{ tl: true, bl: true }} {...tileProps(0)} />
        <AlbumTile uri={shown[1]} width={tile} height={tile} round={{ tr: true, br: true }} {...tileProps(1)} />
      </View>
    );
  }

  if (n === 3) {
    const leftW = Math.round((w - ALBUM_GAP) * 0.56);
    const rightW = w - ALBUM_GAP - leftW;
    const halfH = (leftW - ALBUM_GAP) / 2;
    return (
      <View style={[styles.album, { width: w, height: leftW }]}>
        <AlbumTile uri={shown[0]} width={leftW} height={leftW} round={{ tl: true, bl: true }} {...tileProps(0)} />
        <View style={{ width: rightW, height: leftW, justifyContent: 'space-between' }}>
          <AlbumTile uri={shown[1]} width={rightW} height={halfH} round={{ tr: true }} {...tileProps(1)} />
          <AlbumTile uri={shown[2]} width={rightW} height={halfH} round={{ br: true }} {...tileProps(2)} />
        </View>
      </View>
    );
  }

  const tile = (w - ALBUM_GAP) / 2;
  return (
    <View style={[styles.albumCol, { width: w }]}>
      <View style={styles.album}>
        <AlbumTile uri={shown[0]} width={tile} height={tile} round={{ tl: true }} {...tileProps(0)} />
        <AlbumTile uri={shown[1]} width={tile} height={tile} round={{ tr: true }} {...tileProps(1)} />
      </View>
      <View style={styles.album}>
        <AlbumTile uri={shown[2]} width={tile} height={tile} round={{ bl: true }} {...tileProps(2)} />
        <AlbumTile uri={shown[3]} width={tile} height={tile} round={{ br: true }} {...tileProps(3)} />
      </View>
    </View>
  );
}

function ChatImage({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setLoading(true);
    setNatural(null);
    Image.getSize(
      uri,
      (w, h) => {
        if (alive) setNatural({ w, h });
      },
      () => {
        if (!alive) return;
        setFailed(true);
        setLoading(false);
      },
    );
    const fallback = setTimeout(() => {
      if (alive) setLoading(false);
    }, 2800);
    return () => {
      alive = false;
      clearTimeout(fallback);
    };
  }, [uri]);

  const frame = useMemo(() => {
    if (!natural) return { width: IMAGE_MAX_W, height: IMAGE_MAX_W };
    const ratio = natural.w / Math.max(1, natural.h);
    let width = IMAGE_MAX_W;
    let height = width / ratio;
    if (height > IMAGE_MAX_H) {
      height = IMAGE_MAX_H;
      width = height * ratio;
    }
    return { width: Math.round(width), height: Math.round(height) };
  }, [natural]);

  if (failed || uri.startsWith('ph://')) {
    return (
      <View style={[styles.imageFallback, frame]}>
        <Ionicons name="image-outline" size={28} color="rgba(255,255,255,0.7)" />
        <Text style={styles.imageFallbackText}>ส่งรูปแล้ว</Text>
      </View>
    );
  }

  return (
    <View style={[styles.imageFrame, frame]}>
      <Image
        source={{ uri }}
        style={frame}
        resizeMode="cover"
        onLoad={() => setLoading(false)}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
      />
      {loading ? (
        <View style={styles.imageLoading} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

export function ChatBubble({
  message,
  onPay,
  onConvertProduct: _onConvertProduct,
  onPressImage,
  onSelectProductSpecs,
  onBuyProduct,
  onOpenOrder,
  onQuote,
  onLongPress,
  selectMode,
  selected,
  selectedImageIndexes,
  onToggleSelect,
  onToggleImage,
  peerFace,
  myFace,
  onRetryFailed,
}: Props) {
  const mine = isCurrentChatUser(message.senderId);
  const quoteThis = useCallback(() => onQuote?.(message), [message, onQuote]);
  const longThis = useCallback(() => onLongPress?.(message), [message, onLongPress]);
  const canSwipe = Boolean(onQuote) && message.kind !== 'system' && !selectMode;
  const swipeAlign: 'start' | 'end' = mine ? 'end' : 'start';
  const face = mine ? myFace : peerFace;
  const uris = messageImageUris(message);
  const swipe = (node: React.ReactNode) => {
    const inner = (
      <SwipeToQuote
        enabled={canSwipe}
        onQuote={quoteThis}
        onLongPress={message.kind === 'system' || selectMode ? undefined : longThis}
        onPress={
          uris.length && !selectMode
            ? (x, y) => {
                void Haptics.selectionAsync();
                onPressImage?.(message.id, hitAlbumIndex(uris.length, x, y));
              }
            : undefined
        }
        align={swipeAlign}
      >
        {node}
      </SwipeToQuote>
    );
    const withFace =
      message.kind === 'system' || !face ? (
        inner
      ) : (
        <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowPeer]}>
          {!mine ? <MessageFace face={face} /> : null}
          {inner}
          {mine ? <MessageFace face={face} /> : null}
        </View>
      );
    if (!selectMode) return withFace;
    if (message.kind === 'system') return withFace;
    return (
      <View style={styles.selectRow}>
        <Pressable
          onPress={() => onToggleSelect?.(message)}
          hitSlop={8}
          style={styles.selectHit}
          accessibilityLabel={selected ? 'ยกเลิกเลือก' : 'เลือกข้อความ'}
        >
          <View style={[styles.rowCheck, selected && styles.rowCheckOn]}>
            {selected ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
          </View>
        </Pressable>
        <Pressable
          style={[styles.selectBody, mine ? styles.msgRowMine : styles.msgRowPeer]}
          onPress={() => {
            if (uris.length) return;
            onToggleSelect?.(message);
          }}
        >
          {withFace}
        </Pressable>
      </View>
    );
  };

  if (message.kind === 'product' && message.product) {
    return swipe(
      <ProductShopCard
        product={message.product}
        mine={mine}
        unread={message.deliveryStatus !== 'read' && mine}
        onOpen={() => onSelectProductSpecs?.(message.product)}
        onSelectSpecs={() => onSelectProductSpecs?.(message.product)}
        onBuy={() => onBuyProduct?.(message.product)}
      />,
    );
  }

  if (message.kind === 'quotation' && message.quotation) {
    const q = message.quotation;
    const paid = q.status === 'paid';
    return swipe(
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
      </View>,
    );
  }

  if (message.kind === 'order_ref' && message.orderRef) {
    return swipe(
      <View style={[styles.contentRefWrap, styles.peerAlign]}>
        <OrderSnapshotView snapshot={message.orderRef} onOpenDetail={() => onOpenOrder?.(message.orderRef!)} />
      </View>,
    );
  }

  if (message.kind === 'content_ref' && message.contentRef) {
    const ref = message.contentRef;
    return swipe(
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
      </View>,
    );
  }

  if (message.kind === 'job_match' && message.jobMatch) {
    const job = message.jobMatch;
    return swipe(
      <View style={[styles.jobMatchWrap, styles.peerAlign]}>
        <Text style={styles.jobMatchHeader}>{job.header}</Text>
        <Text style={styles.jobMatchDetails} numberOfLines={4}>
          {job.details}
        </Text>
        <Text style={styles.jobMatchDistance}>
          ห่าง {job.distanceKm.toFixed(1)} กม.
        </Text>
        {job.skills.length > 0 ? (
          <View style={styles.jobSkillRow}>
            {job.skills.slice(0, 4).map((skill) => (
              <View key={skill} style={styles.jobSkillChip}>
                <Text style={styles.jobSkillText}>{skill}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.jobCta}>
          <Text style={styles.jobCtaText}>{job.actionLabel}</Text>
        </View>
      </View>,
    );
  }

  if (message.kind === 'voice' && message.audioUri) {
    return swipe(
      <View style={message.deliveryStatus === 'sending' ? styles.bubbleSending : undefined}>
        <VoiceBubble message={message} mine={mine} />
        {mine ? (
          <ReceiptMark
            message={message}
            onRetry={() => onRetryFailed?.(message)}
            style={styles.readReceipt}
          />
        ) : null}
      </View>,
    );
  }

  if (message.kind === 'file') {
    return swipe(
      <FileBubble
        message={message}
        mine={mine}
        onRetry={mine ? () => onRetryFailed?.(message) : undefined}
      />,
    );
  }

  if (message.kind === 'image' && uris.length) {
    return swipe(
      <View
        style={[
          styles.imageWrap,
          mine ? styles.mineAlign : styles.peerAlign,
          message.deliveryStatus === 'sending' ? styles.bubbleSending : null,
        ]}
      >
        <View style={styles.albumStage}>
          <ImageAlbum
            uris={uris}
            selectMode={selectMode}
            selectedIndexes={selectedImageIndexes}
            onToggleImage={(index) => onToggleImage?.(message, index)}
          />
          {message.deliveryStatus === 'sending' ? (
            <View style={styles.sendingOverlay} pointerEvents="none">
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.time, mine && styles.timeMine]}>{message.createdAt}</Text>
          {mine ? (
            <ReceiptMark
              message={message}
              onRetry={() => onRetryFailed?.(message)}
              style={styles.readReceipt}
            />
          ) : null}
        </View>
      </View>,
    );
  }

  return swipe(
    <View style={[styles.bubbleRow, mine ? styles.mineAlign : styles.peerAlign]}>
      {mine ? (
        <SideMeta message={message} mine onRetry={() => onRetryFailed?.(message)} />
      ) : null}
      <View
        style={[
          styles.bubble,
          mine ? styles.mine : styles.peer,
          message.quote ? styles.bubbleQuoted : null,
          message.deliveryStatus === 'sending' ? styles.bubbleSending : null,
        ]}
      >
        {message.quote ? <QuoteHeader mine={mine} quote={message.quote} /> : null}
        {message.text ? (
          <Text
            style={[
              styles.text,
              mine && styles.textMine,
              message.quote ? styles.textAfterQuote : null,
            ]}
          >
            {message.text}
          </Text>
        ) : null}
      </View>
      {!mine ? <SideMeta message={message} mine={false} /> : null}
    </View>,
  );
}

const CARD_ORANGE = '#EE4D2D';
const CARD_ORANGE_DEEP = '#F53D2D';

function ProductShopCard({
  product,
  mine,
  unread,
  onOpen,
  onSelectSpecs,
  onBuy,
}: {
  product: ProductCard;
  mine: boolean;
  unread: boolean;
  onOpen?: () => void;
  onSelectSpecs?: () => void;
  onBuy?: () => void;
}) {
  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const master = useMemo(
    () => masters.find((row) => row.id === product.id) ?? null,
    [masters, product.id],
  );
  const variant = useMemo(
    () =>
      variants.find((row) => row.sku === product.sku && row.masterSkuId === product.id) ??
      variants.find((row) => row.masterSkuId === product.id) ??
      null,
    [variants, product.id, product.sku],
  );
  const imageUri =
    product.imageUri?.trim() ||
    (master ? variantImageUri(master, variant) : masterContentImage(product.id));
  const soldCount = product.soldCount ?? 200 + (hashSeed(product.id) % 1800);
  const shipping = product.shippingHint ?? 'ส่งด่วน · คาดส่งภายใน 5 ชม.';
  const policy = product.returnHint ?? 'คืนได้ใน 7 วัน · คืนเงินเร็ว';

  const tap = (fn?: () => void) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn?.();
  };

  return (
    <View style={[styles.productRow, mine ? styles.mineAlign : styles.peerAlign]}>
      {mine && unread ? <Text style={styles.productUnread}>ยังไม่อ่าน</Text> : null}
      <View style={styles.productCard}>
        <Pressable style={styles.productTop} onPress={() => tap(onOpen)}>
          <View style={styles.productThumbWrap}>
            <Image source={{ uri: imageUri }} style={styles.productThumb} />
            <View style={styles.productSoldBar}>
              <Text style={styles.productSoldText}>
                ขายแล้ว {soldCount.toLocaleString('th-TH')}+
              </Text>
            </View>
          </View>
          <View style={styles.productBody}>
            <Text style={styles.productTitle} numberOfLines={2}>
              {product.title}
            </Text>
            <Text style={styles.productShip} numberOfLines={1}>
              {shipping}
            </Text>
            <Text style={styles.productPrice}>{formatTHB(product.price)}</Text>
            <Pressable style={styles.productPolicy} onPress={() => tap(onOpen)}>
              <Text style={styles.productPolicyText} numberOfLines={1}>
                {policy}
              </Text>
              <Ionicons name="chevron-forward" size={12} color="#B0B0B0" />
            </Pressable>
          </View>
        </Pressable>
        <View style={styles.productActions}>
          <Pressable style={styles.specBtn} onPress={() => tap(onSelectSpecs)}>
            <Text style={styles.specBtnText}>เลือกสเปก</Text>
          </Pressable>
          <Pressable style={styles.buyNowBtn} onPress={() => tap(onBuy)}>
            <Text style={styles.buyNowBtnText}>ซื้อเลย</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function fileKindLabel(mime?: string, name?: string) {
  const ext = name?.split('.').pop()?.toUpperCase();
  if (mime?.includes('pdf') || ext === 'PDF') return 'PDF';
  if (mime?.startsWith('image/')) return 'รูป';
  if (mime?.startsWith('video/')) return 'วิดีโอ';
  if (mime?.startsWith('audio/')) return 'เสียง';
  if (ext && ext.length <= 5) return ext;
  return 'ไฟล์';
}

function FileBubble({
  message,
  mine,
  onRetry,
}: {
  message: ChatMessage;
  mine: boolean;
  onRetry?: () => void;
}) {
  const name = message.fileName || 'ไฟล์';
  const meta = [formatFileSize(message.fileSize), fileKindLabel(message.mimeType, name)]
    .filter(Boolean)
    .join(' · ');

  const openFile = () => {
    if (!message.fileUri) return;
    void Haptics.selectionAsync();
    void Share.share({ url: message.fileUri, title: name, message: name });
  };

  return (
    <View style={[styles.fileWrap, mine ? styles.mine : styles.peer]}>
      <GHPressable
        onPress={openFile}
        accessibilityRole="button"
        accessibilityLabel={`ไฟล์ ${name} — ปัดซ้ายเพื่ออ้างอิง`}
      >
        <View style={styles.fileRow}>
          <View style={[styles.fileIcon, mine ? styles.fileIconMine : styles.fileIconPeer]}>
            <Ionicons
              name="document-text-outline"
              size={22}
              color={mine ? colors.brand.ink : colors.text.inverse}
            />
          </View>
          <View style={styles.fileBody}>
            <Text style={[styles.fileName, mine && styles.textMine]} numberOfLines={2}>
              {name}
            </Text>
            {meta ? (
              <Text style={[styles.fileMeta, mine && styles.timeMine]}>{meta}</Text>
            ) : null}
          </View>
        </View>
      </GHPressable>
      <View style={styles.metaRow}>
        <Text style={[styles.time, mine && styles.timeMine]}>{message.createdAt}</Text>
        {mine ? (
          <ReceiptMark
            message={message}
            onRetry={onRetry}
            style={styles.readReceipt}
          />
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
      <Text style={[styles.voiceDuration, mine && styles.textMine]}>{duration}&quot;</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleQuoted: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'hidden',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '92%',
    gap: 6,
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
    marginVertical: 4,
  },
  bubbleSending: {
    opacity: 0.72,
  },
  sendingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  albumStage: {
    position: 'relative',
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  album: {
    flexDirection: 'row',
    gap: ALBUM_GAP,
    overflow: 'hidden',
  },
  albumCol: {
    gap: ALBUM_GAP,
    overflow: 'hidden',
  },
  swipeWrap: {
    position: 'relative',
    overflow: 'visible',
    maxWidth: '78%',
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginVertical: 4,
    maxWidth: '100%',
  },
  msgRowMine: {
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
  },
  msgRowPeer: {
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
  },
  quoteHint: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 16,
  },
  quoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quoteHeaderMine: {
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  quoteHeaderPeer: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  quoteHeaderBody: {
    flex: 1,
    minWidth: 0,
  },
  quoteHeaderName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
  },
  quoteHeaderNameMine: {
    color: colors.brand.ink,
  },
  quoteHeaderSnippet: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.secondary,
    marginTop: 1,
  },
  quoteHeaderSnippetMine: {
    color: 'rgba(7,20,15,0.62)',
  },
  quoteHeaderThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.border.soft,
  },
  textAfterQuote: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  sideMeta: {
    marginBottom: 8,
    maxWidth: 64,
    gap: 1,
  },
  sideMetaMine: {
    alignItems: 'flex-end',
  },
  sideMetaPeer: {
    alignItems: 'flex-start',
  },
  sideRead: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
  },
  receiptFailed: {
    color: colors.accent.live,
    textDecorationLine: 'underline',
  },
  sideTime: {
    fontSize: 10,
    color: colors.text.muted,
  },
  quotePlay: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
    alignSelf: 'stretch',
  },
  selectHit: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBody: {
    flex: 1,
    minWidth: 0,
  },
  rowCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCheckOn: {
    backgroundColor: SELECT_GREEN,
    borderColor: SELECT_GREEN,
  },
  tileCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
  },
  tileCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCheckCircleOn: {
    backgroundColor: SELECT_GREEN,
    borderColor: SELECT_GREEN,
  },
  quoteFileIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.mist,
  },
  quoteThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.border.soft,
  },
  quoteStripText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  imageFrame: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface.card,
  },
  imageFallback: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2A24',
    gap: 6,
  },
  imageFallbackText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  imageLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 16,
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
  fileWrap: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 4,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIconMine: {
    backgroundColor: 'rgba(7,20,15,0.12)',
  },
  fileIconPeer: {
    backgroundColor: colors.brand.ink,
  },
  fileBody: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  fileMeta: {
    marginTop: 2,
    fontSize: 11,
    color: colors.text.muted,
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
  jobMatchWrap: {
    maxWidth: '88%',
    marginVertical: 8,
    backgroundColor: colors.surface.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.brand.primary,
  },
  jobMatchHeader: {
    color: colors.brand.primaryDark,
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 8,
  },
  jobMatchDetails: {
    color: colors.text.primary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  jobMatchDistance: {
    marginTop: 8,
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  jobSkillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  jobSkillChip: {
    backgroundColor: colors.brand.ink,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  jobSkillText: {
    color: colors.brand.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  jobCta: {
    marginTop: 12,
    backgroundColor: colors.brand.primary,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  jobCtaText: {
    color: colors.brand.ink,
    fontWeight: '900',
    fontSize: 13,
  },
  productRow: {
    maxWidth: '86%',
    marginVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  productUnread: {
    color: CARD_ORANGE,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 10,
  },
  productCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  productTop: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
  },
  productThumbWrap: {
    width: 88,
    height: 88,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F2F2F2',
  },
  productThumb: {
    width: 88,
    height: 88,
  },
  productSoldBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 3,
    alignItems: 'center',
  },
  productSoldText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  productBody: {
    flex: 1,
    minWidth: 0,
  },
  productTitle: {
    color: '#111',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
  productShip: {
    marginTop: 4,
    color: '#00A86B',
    fontSize: 11,
    fontWeight: '700',
  },
  productPrice: {
    marginTop: 4,
    color: CARD_ORANGE,
    fontSize: 18,
    fontWeight: '900',
  },
  productPolicy: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  productPolicyText: {
    flex: 1,
    color: '#9A9A9A',
    fontSize: 11,
    fontWeight: '600',
  },
  productActions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  specBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1EB',
  },
  specBtnText: {
    color: CARD_ORANGE,
    fontSize: 13,
    fontWeight: '800',
  },
  buyNowBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_ORANGE_DEEP,
  },
  buyNowBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
