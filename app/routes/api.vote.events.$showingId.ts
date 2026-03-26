/**
 * SSE endpoint for live showing updates.
 * GET /api/vote/events/:showingId
 *
 * Streams "update" events whenever the showing's updatedAt changes.
 * Clients use EventSource to listen and trigger revalidation.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { getShowing } from "~/lib/vote/storage.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const showingId = params.showingId;
  if (!showingId) {
    return new Response("Not Found", { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastUpdatedAt = 0;
      let closed = false;

      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Initial check
      const initial = await getShowing(showingId);
      if (initial) {
        lastUpdatedAt = initial.updatedAt;
        send(JSON.stringify({ updatedAt: lastUpdatedAt }));
      }

      // Poll the file every 1.5s for changes
      const poll = async () => {
        if (closed) return;

        try {
          const showing = await getShowing(showingId);
          if (!showing) {
            send(JSON.stringify({ deleted: true }));
            controller.close();
            return;
          }

          if (showing.updatedAt !== lastUpdatedAt) {
            lastUpdatedAt = showing.updatedAt;
            send(JSON.stringify({ updatedAt: lastUpdatedAt }));
          }
        } catch {
          // File read error — skip this tick
        }

        if (!closed) {
          setTimeout(poll, 1500);
        }
      };

      setTimeout(poll, 1500);

      // Keep-alive ping every 30s
      const keepAlive = setInterval(() => {
        if (closed) {
          clearInterval(keepAlive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
          clearInterval(keepAlive);
        }
      }, 30_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
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
