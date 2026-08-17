/**
 * Push is optional. Failure must never fail chat send.
 */

import type { ChatMessageDto } from '../types';

export function notifyChatPush(msg: ChatMessageDto, senderId: string) {
  void import('../../notify/PushService')
    .then(({ sendPushToUsers }) => {
      const others = (msg.metadata?.participantIds as string[] | undefined) ?? [];
      const targets = others.filter((id) => id && id !== senderId);
      if (!targets.length) return;
      return sendPushToUsers({
        userIds: targets,
        title: 'ข้อความใหม่',
        body: msg.body.slice(0, 80) || 'มีข้อความใหม่ในแชท',
        data: { conversationId: msg.conversationId, type: 'chat' },
      });
    })
    .catch((e) => console.warn('[chat] push failed', e));
}
