import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AD_CONFIG,
  DEFAULT_COMPOSER_CONFIG,
  normalizeAdConfig,
  normalizeComposerConfig,
} from '../feedConfigDefaults';

describe('feed config defaults', () => {
  it('falls back to defaults for an empty blob', () => {
    expect(normalizeComposerConfig(undefined)).toEqual(DEFAULT_COMPOSER_CONFIG);
    expect(normalizeAdConfig(null)).toEqual(DEFAULT_AD_CONFIG);
  });

  it('clamps values that would break a page instead of trusting them', () => {
    const composer = normalizeComposerConfig({
      adDensity: 0,
      maxPerRootPost: 99,
      resharePenalty: 4,
      seenTtlHours: -5,
    });
    expect(composer.adDensity).toBe(2);
    expect(composer.maxPerRootPost).toBe(10);
    expect(composer.resharePenalty).toBe(1);
    expect(composer.seenTtlHours).toBe(1);
  });

  it('keeps one reshare of the same content per page by default', () => {
    expect(DEFAULT_COMPOSER_CONFIG.maxPerRootPost).toBe(1);
  });

  it('only accepts the two pacing modes', () => {
    expect(normalizeAdConfig({ pacing: 'asap' }).pacing).toBe('asap');
    expect(normalizeAdConfig({ pacing: 'nonsense' }).pacing).toBe('even');
  });
});
