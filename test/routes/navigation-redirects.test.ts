import { expect, it, vi } from "vitest";
import { loader as watchlist } from "~/routes/app.watchlist";
import { loader as lists } from "~/routes/app.lists";
import { loader as oldNew } from "~/routes/app.new";
import { loader as stuff } from "~/routes/app.stuff._index";
vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "test", requirePlexToken: async () => "test" }));
vi.mock("~/lib/auth/user.server", () => ({ requireUser: async () => ({ id: 1 }) }));

it.each([
  [watchlist, "/app/watchlist?source=trakt&type=show", "/app/stuff/watchlist?source=trakt&type=show"],
  [lists, "/app/lists?sort=title", "/app/stuff/lists?sort=title"],
  [oldNew, "/app/new?tab=top10", "/app/watch/recent?tab=top10"],
  [oldNew, "/app/new?tab=coming", "/app/discover?tab=coming"],
  [stuff, "/app/stuff?source=imdb", "/app/stuff/watchlist?source=imdb"],
] as const)("preserves query state from %s %s", async (loader, from, to) => {
  const response = await Promise.resolve().then<unknown>(() => loader({ request: new Request(`http://watchtower.test${from}`), params: {}, context: {} })).catch((error: unknown) => error);
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(302);
  expect((response as Response).headers.get("Location")).toBe(to);
});
