import { auth } from "@/lib/auth";
import { addSSEClient, removeSSEClient } from "@/lib/notifications/sse-emitter";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/stream — SSE 실시간 알림 스트림
 * 클라이언트가 EventSource로 연결하면 알림을 실시간으로 수신
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`)
      );

      // Register client
      const client = addSSEClient(userId, controller);

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          removeSSEClient(client);
        }
      }, 30000);

      // Cleanup on close (handled via AbortController in practice)
      // The stream will be closed when the client disconnects
    },
    cancel() {
      // Stream cancelled by client disconnect
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
