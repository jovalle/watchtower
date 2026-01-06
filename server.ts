/**
 * Custom Express server with structured logging.
 * Replaces remix-serve for better log control.
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createRequestHandler } from "@remix-run/express";

const app = express();
const PORT = process.env.PORT || 9001;

// Log levels
type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m",  // cyan
  warn: "\x1b[33m",  // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const color = LOG_COLORS[level];
  const levelStr = level.toUpperCase().padEnd(5);

  let output = `${timestamp} ${color}${levelStr}${RESET} ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    output += ` ${JSON.stringify(meta)}`;
  }

  if (level === "error") {
    console.error(output);
  } else {
    console.log(output);
  }
}

// Request logging middleware
function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;

    // Determine log level based on status code
    let level: LogLevel = "info";
    if (status >= 500) level = "error";
    else if (status >= 400) level = "warn";

    // Demote high-frequency endpoints to DEBUG (preserving WARN/ERROR)
    const isNoisy = req.path.includes("/api/plex/sessions") ||
                    req.path.includes("/api/plex/timeline") ||
                    // HLS segments and playlist refreshes (not initial start.m3u8)
                    (req.path.includes("/api/plex/hls/") &&
                     !req.path.endsWith("/start.m3u8"));
    if (isNoisy && level === "info") level = "debug";

    const contentLength = res.get("Content-Length");
    const meta: Record<string, unknown> = {
      status,
      ms: duration,
    };
    if (contentLength) meta.bytes = parseInt(contentLength, 10);

    log(level, `${req.method} ${req.path}`, meta);
  });

  next();
}

async function start() {
  // Dynamically import the Remix build (only exists after remix build)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line import/no-unresolved
  const build = await import("./build/server/index.js");

  // Trust proxy for correct IP detection behind reverse proxy
  app.set("trust proxy", true);

  // Request logging
  app.use(requestLogger);

  // Serve static files from public directory
  app.use(express.static("public", { maxAge: "1h" }));

  // Serve built client assets (includes /assets directory)
  app.use(
    express.static("build/client", {
      maxAge: "1y",
      immutable: true,
    })
  );

  // Handle all other requests with Remix
  app.all(
    "{*splat}",
    createRequestHandler({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      build: build as any,
      mode: process.env.NODE_ENV,
    })
  );

  app.listen(PORT, () => {
    log("info", `Server started`, { port: PORT, env: process.env.NODE_ENV || "development" });
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
