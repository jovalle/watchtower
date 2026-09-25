import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { env } from "~/lib/env.server";
import { getIntegrations } from "./storage.server";
import { seerrForUser, SeerrRequestError, type SeerrRequest } from "./seerr.server";
import { requestState } from "./request-state";

export interface RequestNotification {
  id: string;
  title: string;
  state: string;
  href: string;
  createdAt: number;
  read: boolean;
}
interface Snapshot { states: string[]; title: string; href: string; }
interface Inbox {
  version: 1;
  initialized: boolean;
  checkedAt: number;
  error: string | null;
  limited: boolean;
  requests: Record<string, Snapshot>;
  notifications: RequestNotification[];
}
// ponytail: one app process owns DATA_PATH; use a transactional database before running multiple writers.
const locks = new Map<string, Promise<unknown>>();

export async function requestInbox(plexId: number, markRead?: string): Promise<Inbox> {
  if (!Number.isSafeInteger(plexId) || plexId < 1) throw new Error("Invalid user.");
  const config = await getIntegrations();
  const scope = createHash("sha256").update(config.seerr?.url ?? "unconfigured").digest("hex").slice(0, 16);
  const directory = join(env.DATA_PATH, "notifications");
  const file = join(directory, `${plexId}-${scope}.json`);
  const previous = locks.get(file) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    let inbox: Inbox;
    try {
      inbox = JSON.parse(await readFile(file, "utf8"));
      if (inbox.version !== 1 || !Array.isArray(inbox.notifications) || !inbox.requests) throw new Error("Invalid notification storage.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      inbox = { version: 1, initialized: false, checkedAt: 0, error: null, limited: false, requests: {}, notifications: [] };
    }
    if (markRead !== undefined) {
      for (const notice of inbox.notifications) if (markRead === "all" || notice.id === markRead) notice.read = true;
    } else if (Date.now() - inbox.checkedAt >= 60000) {
      inbox.checkedAt = Date.now();
      try {
        const { client, userId } = await seerrForUser(plexId);
        const first = await client.getRequests(userId, 1, "all");
        const pages = Math.min(first.pageInfo.pages, 10);
        const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => client.getRequests(userId, i + 2, "all")));
        const items = [...first.results, ...rest.flatMap((page) => page.results)].filter((item) => item.requestedBy.id === userId);
        const observed = new Set(items.map((item) => String(item.id)));
        inbox.limited = first.pageInfo.pages > 10;
        const changes: Array<{ id: string; state: string; item?: SeerrRequest }> = items.map((item) => ({ id: String(item.id), state: `${item.is4k ? "4K · " : ""}${requestState(item)}`, item }));
        // A missing page item is not proof of deletion: verify against the permission-scoped endpoint.
        if (!inbox.limited) {
          const missing = Object.keys(inbox.requests).filter((id) => !observed.has(id) && inbox.requests[id].states.at(-1) !== "Cancelled or deleted");
          const checked = await Promise.all(missing.slice(0, 20).map(async (id) => {
            try {
              const item = await client.getRequest(Number(id), userId);
              return item.requestedBy.id === userId ? { id, item, state: `${item.is4k ? "4K · " : ""}${requestState(item)}` } : null;
            } catch (error) {
              if (error instanceof SeerrRequestError && error.status === 404) return { id, state: "Cancelled or deleted" };
              throw error;
            }
          }));
          changes.push(...checked.filter((item) => item !== null));
        }
        const updates = await Promise.all(changes.map(async ({ id, state, item }) => {
          const previous = inbox.requests[id];
          if (previous?.states.at(-1) === state) return null;
          const metadata = item && inbox.initialized ? await client.getTitle(item.media.mediaType, item.media.tmdbId, userId).catch(() => null) : null;
          const title = metadata?.title || metadata?.name || previous?.title || `Title #${item?.media.tmdbId}`;
          const href = item ? `/app/media/${item.media.mediaType === "tv" ? "show" : "movie"}/tmdb-${item.media.tmdbId}` : previous.href;
          return { id, state, title, href, previous };
        }));
        for (const update of updates) {
          if (!update) continue;
          const { id, state, title, href } = update;
          // Keep the existing storage shape, but deduplicate only unchanged observations.
          inbox.requests[id] = { states: [state], title, href };
          if (inbox.initialized) inbox.notifications.unshift({ id: randomUUID(), title, state, href, createdAt: Date.now(), read: false });
        }
        inbox.notifications = inbox.notifications.slice(0, 200);
        inbox.initialized = true;
        inbox.error = null;
      } catch {
        inbox.error = "Couldn't refresh requests. Check Seerr and your account access. Your saved notifications are still available.";
      }
    }
    await mkdir(directory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(inbox), { mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
    return inbox;
  });
  locks.set(file, operation);
  try { return await operation; }
  finally { if (locks.get(file) === operation) locks.delete(file); }
}
