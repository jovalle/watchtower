import path from 'node:path';
import assert from 'node:assert/strict';
const code = process.argv[2];
assert(code && /^[A-Z0-9 -]{8,11}$/.test(code), 'Provide the displayed TV code');
const origin = 'http://127.0.0.1:9031';
process.env.DATA_PATH = path.resolve("tmp/tv-e2e/data");
process.env.SECURE_COOKIES = "false";
const { getSession, commitSession } = await import("../../app/lib/auth/session.server");
const session = await getSession(new Request(origin));
session.set("plexToken", "fake-account-token");
const cookie = (await commitSession(session)).split(";")[0];
const url = `${origin}/app/link?_data=routes/app.link`;
const loader = await fetch(url, { headers: { Cookie: cookie } });
assert.equal(loader.status, 200);
const { csrf } = await loader.json() as { csrf: string };
for (const intent of ['lookup', 'approve']) {
 const response = await fetch(url, { method: 'POST', headers: { Cookie: cookie, Origin: origin }, body: new URLSearchParams({csrf, code, intent}) });
 const result = await response.json() as {ok:boolean;message:string;authorization?:{deviceName:string}};
 assert.equal(response.status,200, JSON.stringify(result));
 assert.equal(result.ok,true, JSON.stringify(result));
 console.log(intent, result.authorization?.deviceName ?? result.message);
}
