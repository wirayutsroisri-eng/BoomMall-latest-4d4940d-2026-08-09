/**
 * Applies the pre-publish filter and turns a verdict into an action:
 * block → refuse with a message the poster can act on;
 * flag  → store the post but queue it for a human.
 */

import { AppError } from '../../../lib/errors';
import { recordAnalyticsEvent } from '../../ecommerce/EventService';
import { screenText } from './contentFilter';

export async function guardUserContent(input: {
  text: string;
  authorId: string;
  entityType: 'POST' | 'COMMENT';
  entityId?: string;
}): Promise<void> {
  const verdict = screenText(input.text);
  if (verdict.action === 'allow') return;

  if (verdict.action === 'block') {
    await recordAnalyticsEvent({
      userId: input.authorId,
      name: 'CONTENT_AUTO_BLOCK',
      entityType: input.entityType,
      entityId: input.entityId,
      payload: { reason: verdict.reason },
    }).catch(() => undefined);
    throw new AppError('CONTENT_BLOCKED', verdict.message ?? 'เนื้อหานี้ขัดกับกฎการใช้งาน', 422);
  }

  await recordAnalyticsEvent({
    userId: input.authorId,
    name: 'CONTENT_AUTO_FLAG',
    entityType: input.entityType,
    entityId: input.entityId,
    payload: { reason: verdict.reason },
  }).catch(() => undefined);
}
