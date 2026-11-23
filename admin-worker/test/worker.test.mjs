import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';

const origin = 'https://startube.example';
let env, calls;
const nativeFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  env = { ADMIN_PASSWORD: 'test-password', SESSION_SECRET: 'test-signing-key-for-local-checks-only', GITHUB_TOKEN: 'test-github-token',
    LOGIN_LIMITER: { limit: async () => ({ success: true }) } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url.url || url), options });
    if (String(url.url || url).includes('api.github.com')) return Response.json({ ok: true });
    return new Response('<html><head></head><body>StarTube</body></html>');
  };
});
function request(path, method = 'GET', body, cookie, source = origin) {
  return worker.fetch(new Request(`${origin}/admin/api/${path}`, { method,
    headers: { Origin: source, ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
}
async function login() {
  const response = await request('login', 'POST', { password: 'test-password' });
  assert.equal(response.status, 200);
  return response.headers.get('Set-Cookie').split(';')[0];
}
test('admin URL serves the existing Pages application', async () => {
  const response = await worker.fetch(new Request(`${origin}/admin`), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /StarTube/);
  assert.equal(calls[0].url, origin + '/');
});
test('password login creates a secure session and restores it', async () => {
  const response = await request('login', 'POST', { password: 'test-password' });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('Set-Cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=28800']) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes('test-password') && !cookie.includes('test-github-token'));
  assert.deepEqual(await (await request('session', 'GET', undefined, cookie.split(';')[0])).json(), { authenticated: true, canWrite: true });
});
test('wrong password, missing session and forged cookies fail', async () => {
  assert.equal((await request('login', 'POST', { password: 'wrong' })).status, 401);
  assert.equal((await request('github/contents/channels.txt')).status, 401);
  const cookie = await login();
  const forged = cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0');
  assert.equal((await request('github/contents/channels.txt', 'GET', undefined, forged)).status, 401);
  assert.equal((await request('github/contents/channels.txt', 'GET', undefined, '__Host-startube-admin=0.aaa.bbb')).status, 401);
});
test('expired session is rejected', async () => {
  const cookie = await login();
  const now = Date.now;
  Date.now = () => now() + 9 * 60 * 60 * 1000;
  try { assert.equal((await request('github/contents/hidden.txt', 'GET', undefined, cookie)).status, 401); }
  finally { Date.now = now; }
});
test('cross origin login and writes fail before reaching GitHub', async () => {
  assert.equal((await request('login', 'POST', { password: 'test-password' }, undefined, 'https://other.example')).status, 403);
  const cookie = await login();
  assert.equal((await request('github/contents/hidden.txt', 'PUT', {}, cookie, 'https://other.example')).status, 403);
  assert.equal(calls.length, 0);
});
test('rate limiter rejects repeated login attempts', async () => {
  env.LOGIN_LIMITER.limit = async () => ({ success: false });
  const response = await request('login', 'POST', { password: 'test-password' });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
});
test('allowed file edits use the server token and discard extra properties', async () => {
  const cookie = await login();
  const body = { message: 'hide video', content: 'YWJj', sha: 'abc', branch: 'another-branch' };
  assert.equal((await request('github/contents/hidden.txt', 'PUT', body, cookie)).status, 200);
  assert.equal(calls[0].url, 'https://api.github.com/repos/iamnotfemale/StarTube/contents/hidden.txt');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-github-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { message: 'hide video', content: 'YWJj', sha: 'abc' });
});
test('repository scope and mutation methods are restricted', async () => {
  const cookie = await login();
  for (const [path, method] of [['github/contents/index.html', 'PUT'], ['github/actions/workflows/fetch.yml/dispatches', 'POST'], ['github/issues/1', 'PUT'], ['github/../other', 'GET']]) {
    assert.ok((await request(path, method, method === 'GET' ? undefined : {}, cookie)).status >= 400);
  }
  assert.equal(calls.length, 0);
});
test('report queries are fixed and issue closing is constrained', async () => {
  const cookie = await login();
  assert.equal((await request('github/issues?state=all', 'GET', undefined, cookie)).status, 200);
  assert.ok(calls[0].url.endsWith('issues?labels=report&state=open&per_page=100'));
  assert.equal((await request('github/issues/12', 'PATCH', { state: 'open' }, cookie)).status, 400);
  assert.equal((await request('github/issues/12', 'PATCH', { state: 'closed', title: 'ignored' }, cookie)).status, 200);
  assert.deepEqual(JSON.parse(calls[1].options.body), { state: 'closed' });
});
test('logout expires browser cookie', async () => {
  const response = await request('logout', 'POST', undefined, await login());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.deepEqual(await (await request('session')).json(), { authenticated: false, canWrite: false });
});
test('invalid and oversized JSON fail without an upstream call', async () => {
  const cookie = await login();
  assert.equal((await request('github/contents/hidden.txt', 'PUT', null, cookie)).status, 400);
  assert.equal((await request('github/contents/hidden.txt', 'PUT', { content: 'x'.repeat(131073) }, cookie)).status, 400);
  assert.equal(calls.length, 0);
});
test('missing configuration and GitHub authentication failures are actionable', async () => {
  const cookie = await login();
  globalThis.fetch = async () => Response.json({ message: 'sensitive upstream details' }, { status: 401 });
  const response = await request('github/contents/hidden.txt', 'GET', undefined, cookie);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { message: 'GitHub 요청 실패 (401)' });
  env.SESSION_SECRET = '';
  assert.equal((await request('session')).status, 503);
  globalThis.fetch = nativeFetch;
});

test('login and public reads work without a write token; writes fail explicitly', async () => {
  delete env.GITHUB_TOKEN;
  const cookie = await login();
  assert.deepEqual(await (await request('session', 'GET', undefined, cookie)).json(), { authenticated: true, canWrite: false });
  assert.equal((await request('github/contents/channels.txt', 'GET', undefined, cookie)).status, 200);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal((await request('github/contents/channels.txt', 'PUT', { content: 'YWJj', sha: 'abc', message: 'test' }, cookie)).status, 503);
  assert.equal(calls.length, 1);
});
