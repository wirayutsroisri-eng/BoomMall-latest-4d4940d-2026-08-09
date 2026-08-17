/**
 * Chat realtime attach point. Implementation lives in src/realtime/socket.gateway.ts
 */

import type { Server as HttpServer } from 'node:http';
import type { Server } from 'socket.io';
import { attachSocketGateway, getSocketGateway } from '../../../realtime/socket.gateway';

export type ChatRealtimeHandles = {
  io: Server;
  path: string;
};

export async function attachChatRealtime(httpServer: HttpServer): Promise<ChatRealtimeHandles> {
  return attachSocketGateway(httpServer);
}

export function getChatIo(): Server | null {
  return getSocketGateway()?.server ?? null;
}

export function emitToConversation(conversationId: string, event: string, data: unknown) {
  getSocketGateway()?.emitToConversation(conversationId, event, data);
}

export function emitToUser(userId: string, event: string, data: unknown) {
  getSocketGateway()?.emitToUser(userId, event, data);
}

export async function fanoutToConversation(conversationId: string, event: string, data: unknown) {
  await getSocketGateway()?.fanoutToConversation(conversationId, event, data);
}
