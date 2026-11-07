import { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { sendResponse } from "../../app/lib/response-stream.server";
import type { Response as ExpressResponse } from "express";

class Output extends Writable {
  headers = new Map<string, string[]>();
  statusMessage = "";
  statusCode = 200;
  blocked = true;
  pending: (() => void) | undefined;
  constructor() { super({ highWaterMark: 1 }); this.on("error", () => {}); }
  status(code: number) { this.statusCode = code; return this; }
  append(name: string, value: string) { this.headers.set(name.toLowerCase(), [...(this.headers.get(name.toLowerCase()) ?? []), value]); return this; }
  flushHeaders() {}
  _write(_chunk: Buffer, _encoding: string, callback: () => void) {
    if (this.blocked) this.pending = callback;
    else callback();
  }
  release() { this.blocked = false; this.pending?.(); }
}
const express = (output: Output) => output as unknown as ExpressResponse;

describe("HTTP response transport", () => {
  it("bounds upstream reads while the client is backpressured", async () => {
    let produced = 0;
    const body = new ReadableStream({ pull(controller) {
      if (produced === 32) return controller.close();
      produced++;
      controller.enqueue(new Uint8Array(64 * 1024));
    } });
    const output = new Output();
    const sending = sendResponse(express(output), new Response(body));
    await delay(30);
    const bufferedChunks = produced;
    output.release();
    await sending;
    expect(bufferedChunks).toBeLessThanOrEqual(8);
  });

  it("cancels the upstream body when the client disconnects", async () => {
    let canceled = false;
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { source = controller; controller.enqueue(new Uint8Array(64 * 1024)); },
      cancel() { canceled = true; },
    });
    const output = new Output();
    const sending = sendResponse(express(output), new Response(body)).catch(() => {});
    await delay(10);
    output.destroy();
    await delay(20);
    if (!canceled) source.close();
    await sending;
    expect(canceled).toBe(true);
  });

  it("preserves distinct cookies and response status", async () => {
    const output = new Output(); output.release();
    await sendResponse(express(output), new Response(null, { status: 302, headers: [
      ["Set-Cookie", "first=one; HttpOnly; Secure; SameSite=Lax"],
      ["Set-Cookie", "second=two; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Secure"],
      ["Location", "/app"],
    ] }));
    expect(output.statusCode).toBe(302);
    expect(output.headers.get("set-cookie")).toHaveLength(2);
    expect(output.headers.get("location")).toEqual(["/app"]);
  });
});
