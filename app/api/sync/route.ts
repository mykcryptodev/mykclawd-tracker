import { runSync } from "../../../lib/sync";

export async function POST(req: Request) {
  const token = req.headers.get("x-sync-token");
  const syncToken = process.env.SYNC_TOKEN;
  if (syncToken && token !== syncToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const result = await runSync((progress) => emit(progress));
        emit({ done: true, result });
      } catch (e) {
        emit({ error: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
