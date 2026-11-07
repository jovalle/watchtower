/* eslint-env node, es2021 */
import assert from "node:assert/strict";
import path from "node:path";

// Never apply the synthetic identity transport to a real server data directory.
assert.equal(path.resolve(process.env.DATA_PATH ?? ""), path.resolve("tmp/tv-e2e/data"));

// Process-local fixture transport; production routes and authorization stay unchanged.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
 const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
 if (url.hostname !== 'plex.tv') return originalFetch(input, init);
 const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
 if (headers.get('X-Plex-Token') !== 'fake-account-token') return new Response(null, {status:401});
 if (url.pathname === '/api/v2/user') return Response.json({id:1001,uuid:'fixture-owner',username:'fixture',title:'Test Owner',email:'fixture@example.invalid',thumb:''});
 if (url.pathname === '/api/v2/resources') return Response.json([{name:'Fake PMS',provides:'server',clientIdentifier:'fake-machine',accessToken:'fake-owner-token',owned:true}]);
 return new Response(null,{status:404});
};
