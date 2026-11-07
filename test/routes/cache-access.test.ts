import { beforeAll, afterAll, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const data = vi.hoisted(() => ({ path: "" }));
vi.mock("~/lib/env.server", () => ({ env: { get DATA_PATH() { return data.path; } } }));
import { loader } from "~/routes/api.cache.$";

beforeAll(async () => {
  data.path = await fs.mkdtemp(path.join(os.tmpdir(), "watchtower-cache-test-"));
  await fs.mkdir(path.join(data.path, "tmdb/logos"), { recursive: true });
  await fs.mkdir(path.join(data.path, "config"));
  await fs.writeFile(path.join(data.path, "tmdb/logos/logo.png"), "image");
  await fs.writeFile(path.join(data.path, "config/session-secret"), "private");
  await fs.symlink(path.join(data.path, "config/session-secret"), path.join(data.path, "tmdb/logos/link.png"));
});
afterAll(async () => fs.rm(data.path, { recursive: true, force: true }));
const load = (name: string) => loader({ params: { "*": name }, request: new Request("http://localhost"), context: {} });
it("serves cached logos but never configuration, traversal, or symlinks", async () => {
  expect((await load("tmdb/logos/logo.png")).status).toBe(200);
  for (const name of ["config/session-secret", "integrations.json", "tmdb/logos/../../config/session-secret", "tmdb/logos/link.png", "tmdb/logos/file.json"]) {
    expect((await load(name)).status).toBe(404);
  }
});
