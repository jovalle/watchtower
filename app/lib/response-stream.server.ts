import type { Response as ExpressResponse } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export async function sendResponse(output: ExpressResponse, response: Response): Promise<void> {
  output.statusMessage = response.statusText;
  output.status(response.status);
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") output.append(name, value);
  }
  for (const cookie of response.headers.getSetCookie()) output.append("Set-Cookie", cookie);
  if (response.headers.get("Content-Type")?.includes("text/event-stream")) output.flushHeaders();
  if (!response.body) { output.end(); return; }
  // The pinned Remix writer ignores backpressure; a slow TV can otherwise buffer an entire movie.
  await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), output);
}
