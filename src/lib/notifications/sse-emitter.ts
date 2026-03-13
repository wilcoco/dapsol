/**
 * Server-Sent Events (SSE) 알림 에미터
 * 인메모리로 연결된 클라이언트를 관리하고, 알림 발생 시 push
 */

type SSEClient = {
  controller: ReadableStreamDefaultController;
  userId: string;
};

const clients = new Map<string, Set<SSEClient>>();

export function addSSEClient(userId: string, controller: ReadableStreamDefaultController): SSEClient {
  const client: SSEClient = { controller, userId };
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId)!.add(client);
  return client;
}

export function removeSSEClient(client: SSEClient) {
  const userClients = clients.get(client.userId);
  if (userClients) {
    userClients.delete(client);
    if (userClients.size === 0) {
      clients.delete(client.userId);
    }
  }
}

/**
 * 특정 사용자에게 SSE 이벤트 전송
 */
export function emitToUser(userId: string, event: string, data: unknown) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;

  const encoder = new TextEncoder();
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of userClients) {
    try {
      client.controller.enqueue(encoder.encode(payload));
    } catch {
      // Client disconnected, remove
      removeSSEClient(client);
    }
  }
}

/**
 * 알림 생성 시 호출 — 알림을 DB에 저장하고 SSE로 push
 */
export function pushNotification(userId: string, notification: {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  createdAt: string;
}) {
  emitToUser(userId, "notification", notification);
}

export function getConnectedUserCount(): number {
  return clients.size;
}
