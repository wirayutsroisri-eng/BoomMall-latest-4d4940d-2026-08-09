import { describe, expect, it } from 'vitest';
import {
  legacyTextOverlaysForMedia,
  replaceTextOverlaysForMedia,
  textOverlaysForMedia,
  type OverlayObject,
  nextTextBackgroundOpacity,
  nextTextOverlayColor,
  nextTextStylePreset,
  nextTextBackgroundColor,
  nextTextStroke,
  NEW_TEXT_OVERLAY_STYLE,
} from '../domain/editorComposition';
import { mergeFeedItems, normalizePostMedia } from '@/modules/feed/data/mapSocialPost';
import type { FeedItem } from '@/modules/feed/domain/types';

const transform = { x: 0.25, y: 0.4, scale: 1.2, rotation: 0.1 };

describe('editor composition', () => {
  it('keeps text overlays isolated by mediaId', () => {
    const overlays: OverlayObject[] = [
      ...legacyTextOverlaysForMedia({ mediaId: 'photo-a', text: 'A', color: '#fff', transform }),
      ...legacyTextOverlaysForMedia({ mediaId: 'photo-b', text: 'B', color: '#000', transform }),
    ];

    const next = replaceTextOverlaysForMedia(overlays, 'photo-a', [{
      id: 'replacement',
      text: 'A2',
      color: '#f00',
      fontKey: 'kanit',
      transform,
    }]);

    expect(textOverlaysForMedia(next, 'photo-a').map((item) => item.text)).toEqual(['A2']);
    expect(textOverlaysForMedia(next, 'photo-b').map((item) => item.text)).toEqual(['B']);
  });

  it('migrates legacy text without treating it as publish metadata', () => {
    const overlays = legacyTextOverlaysForMedia({
      mediaId: 'video-a',
      text: 'ข้อความบนวิดีโอ',
      color: '#fff',
      transform,
    });

    expect(overlays[0]).toMatchObject({
      mediaId: 'video-a',
      type: 'text',
      text: 'ข้อความบนวิดีโอ',
    });
    expect(overlays[0]).not.toHaveProperty('publishTitle');
  });

  it('preserves presentation style and normalized transform through feed parsing', () => {
    const media = normalizePostMedia({
      images: ['https://example.com/photo.jpg'],
      overlays: [{
        id: 'text-1',
        mediaId: 'media-1',
        type: 'text',
        text: 'Jpgk thailand',
        transform,
        style: {
          color: '#FFFFFF',
          fontKey: 'kanit',
          fontSize: 0.1,
          fontWeight: '800',
          backgroundColor: 'rgba(0,0,0,0.22)',
          strokeColor: '#000000',
          strokeWidth: 2,
          alignment: 'center',
        },
      }],
    });

    expect(media.overlays?.[0]).toMatchObject({
      id: 'text-1',
      transform,
      style: {
        color: '#FFFFFF',
        fontKey: 'kanit',
        fontSize: 0.1,
        backgroundColor: 'rgba(0,0,0,0.22)',
        strokeColor: '#000000',
      },
    });
  });

  it('persists text lock state while keeping legacy overlays unlocked', () => {
    const current = normalizePostMedia({
      overlays: [{
        id: 'locked-text',
        mediaId: 'media-1',
        type: 'text',
        text: 'ห้ามขยับ',
        locked: true,
        transform,
        style: NEW_TEXT_OVERLAY_STYLE,
      }],
    });
    const legacy = normalizePostMedia({
      overlays: [{
        id: 'legacy-text',
        mediaId: 'media-1',
        type: 'text',
        text: 'ข้อความเดิม',
        transform,
        style: NEW_TEXT_OVERLAY_STYLE,
      }],
    });

    expect(current.overlays?.[0]).toMatchObject({ locked: true });
    expect(legacy.overlays?.[0]).toMatchObject({ locked: false });
  });

  it('keeps persisted composition when a hydrate response omits editor metadata', () => {
    const base = {
      id: 'post-1',
      imageUri: 'https://example.com/photo.jpg',
      imageUris: ['https://example.com/photo.jpg'],
      musicTitle: '',
      caption: 'post',
      product: { name: 'post' },
    } as FeedItem;
    const editorMedia = [{ id: 'media-1', uri: base.imageUri!, type: 'image' as const }];
    const overlays = legacyTextOverlaysForMedia({
      mediaId: 'media-1',
      text: 'สวัสดี',
      color: '#FFFFFF',
      transform,
    });

    const [merged] = mergeFeedItems(
      [base],
      [{ ...base, isUserPost: true, editorMedia, overlays }],
    );

    expect(merged.editorMedia).toEqual(editorMedia);
    expect(merged.overlays).toEqual(overlays);
  });

  it.each(['#FFFFFF', '#FE2C55', '#111111'])('keeps text color %s after persistence parsing', (color) => {
    const parsed = normalizePostMedia({
      overlays: [{
        id: `text-${color}`,
        mediaId: 'media-color',
        type: 'text',
        text: 'สีต้องไม่เปลี่ยน',
        transform,
        style: {
          color,
          backgroundColor: '#222222',
          backgroundOpacity: 0.45,
          fontFamily: 'System',
          fontWeight: '700',
          fontSize: 0.12,
          strokeColor: '#000000',
          strokeWidth: 1.5,
          fontKey: 'classic',
        },
      }],
    });
    expect(parsed.overlays?.[0]).toMatchObject({
      style: { color, backgroundOpacity: 0.45, fontWeight: '700', fontSize: 0.12 },
    });
  });

  it('migrates top-level legacy presentation without overriding its color', () => {
    const parsed = normalizePostMedia({
      overlays: [{
        id: 'legacy-red',
        mediaId: 'media-legacy',
        type: 'text',
        text: 'แดง',
        color: '#FE2C55',
        backgroundColor: '#111111',
        backgroundOpacity: 0.3,
        transform,
      }],
    });
    expect(parsed.overlays?.[0]).toMatchObject({
      style: { color: '#FE2C55', backgroundColor: '#111111', backgroundOpacity: 0.3 },
    });
  });

  it('cycles text color, background opacity, and Thai-safe system styles', () => {
    expect(nextTextOverlayColor('#FFFFFF')).toBe('#111111');
    expect(nextTextOverlayColor('#FF6BBA')).toBe('#FFFFFF');
    expect(nextTextBackgroundOpacity({
      color: '#fff',
      fontKey: 'classic',
      backgroundColor: 'transparent',
      backgroundOpacity: 0,
    })).toBe(0.25);
    expect(nextTextBackgroundOpacity({
      color: '#fff',
      fontKey: 'classic',
      backgroundColor: '#000000',
      backgroundOpacity: 1,
    })).toBe(0);
    expect(nextTextStylePreset({ color: '#fff', fontKey: 'classic', preset: 'default' }).key).toBe('bold');
    expect(nextTextStylePreset({ color: '#fff', fontKey: 'classic', preset: 'display' }).key).toBe('default');
  });

  it('starts new text without background or outline and cycles them independently', () => {
    expect(NEW_TEXT_OVERLAY_STYLE).toMatchObject({
      color: '#FFFFFF',
      backgroundColor: 'transparent',
      backgroundOpacity: 0,
      strokeColor: 'transparent',
      strokeWidth: 0,
    });
    expect(nextTextBackgroundColor('transparent')).toBe('#000000');
    expect(nextTextBackgroundColor('#FF6BBA')).toBe('transparent');
    expect(nextTextStroke(NEW_TEXT_OVERLAY_STYLE)).toMatchObject({ color: '#000000', width: 2 });
    expect(nextTextStroke({ ...NEW_TEXT_OVERLAY_STYLE, strokeColor: '#000000', strokeWidth: 2 }))
      .toMatchObject({ color: '#FFFFFF', width: 2 });
    expect(nextTextStroke({ ...NEW_TEXT_OVERLAY_STYLE, strokeColor: '#FFFFFF', strokeWidth: 2 }))
      .toMatchObject({ color: 'transparent', width: 0 });
  });
});
