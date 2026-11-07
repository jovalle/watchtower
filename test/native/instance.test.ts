import { expect, it, vi } from "vitest";
vi.mock("~/lib/config/server-config.server", () => ({ getServerConfig: () => null, getSessionSecret: () => "synthetic-instance-test-secret" }));
import { loader } from "~/routes/api.v1.instance";

it("advertises standalone TV pairing without room support", async () => {
  const response = await loader({ request: new Request("http://watchtower.test/api/v1/instance"), params: {}, context: {} });
  expect(response.status).toBe(200);
  expect((await response.json()).features).toMatchObject({ pairing: true, rooms: false });
});
