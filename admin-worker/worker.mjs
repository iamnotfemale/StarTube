const REPO = 'iamnotfemale/StarTube';
const COOKIE = '__Host-startube-admin';
const TTL = 60 * 60 * 8;
const encoder = new TextEncoder();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});
const cookie = (value, age) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;

async function key(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signature(value, secret) {
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
async function authenticated(request, env) {
  const value = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value) return false;
  const [expires, nonce, mac, extra] = value.split('.');
  if (extra || !/^\d+$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(mac)) return false;
  const remaining = Number(expires) - Math.floor(Date.now() / 1000);
  if (remaining <= 0 || remaining > TTL) return false;
  const bytes = Uint8Array.from(mac.match(/../g), b => parseInt(b, 16));
  return crypto.subtle.verify('HMAC', await key(env.SESSION_SECRET), bytes, encoder.encode(`${expires}.${nonce}`));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
      // Only /admin* is routed to this Worker; the root stays on GitHub Pages.
      const page = await fetch(new Request(new URL('/', url), { method: request.method }));
      const headers = new Headers(page.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(page.body, { status: page.status, headers });
    }
    if (!url.pathname.startsWith('/admin/api/')) return json({ message: '찾을 수 없습니다.' }, 404);
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || !env.LOGIN_LIMITER) {
      return json({ message: '관리자 서버 설정이 필요합니다.' }, 503);
    }
    if (!['GET', 'POST', 'PUT', 'PATCH'].includes(request.method)) return json({ message: '허용되지 않은 요청입니다.' }, 405);
    if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
      return json({ message: '허용되지 않은 출처입니다.' }, 403);
    }
    const path = url.pathname.slice('/admin/api/'.length);
    try {
      if (path === 'login' && request.method === 'POST') {
        const { success } = await env.LOGIN_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
        if (!success) return json({ message: '잠시 후 다시 시도하세요.' }, 429, { 'Retry-After': '60' });
        const body = await readBody(request);
        if (typeof body.password !== 'string' || body.password.length > 256) return json({ message: '비밀번호가 올바르지 않습니다.' }, 401);
        // Compare fixed-length MACs using the platform's constant-time verification.
        const expected = await signature(env.ADMIN_PASSWORD, env.SESSION_SECRET);
        const match = await crypto.subtle.verify('HMAC', await key(env.SESSION_SECRET), Uint8Array.from(expected.match(/../g), b => parseInt(b, 16)), encoder.encode(body.password));
        if (!match) return json({ message: '비밀번호가 올바르지 않습니다.' }, 401);
        const value = `${Math.floor(Date.now() / 1000) + TTL}.${crypto.randomUUID().replaceAll('-', '')}`;
        return json({ authenticated: true, canWrite: Boolean(env.GITHUB_TOKEN) }, 200, { 'Set-Cookie': cookie(`${value}.${await signature(value, env.SESSION_SECRET)}`, TTL) });
      }
      if (path === 'logout' && request.method === 'POST') return json({ authenticated: false }, 200, { 'Set-Cookie': cookie('', 0) });
      const loggedIn = await authenticated(request, env);
      if (path === 'session' && request.method === 'GET') return json({ authenticated: loggedIn, canWrite: loggedIn && Boolean(env.GITHUB_TOKEN) });
      if (!loggedIn) return json({ message: '로그인이 필요합니다.' }, 401);
      const target = path.startsWith('github/') ? path.slice(7) : null;
      const file = /^contents\/(channels\.txt|hidden\.txt)$/.test(target);
      const issue = /^issues\/[1-9]\d*$/.test(target);
      const allowed = request.method === 'GET' ? file || target === 'issues' || target === 'actions/runs'
        : request.method === 'PUT' ? file : request.method === 'PATCH' && issue;
      if (!allowed) return json({ message: '허용되지 않은 작업입니다.' }, 403);
      if (request.method !== 'GET' && !env.GITHUB_TOKEN) return json({ message: 'GitHub 저장 권한 연결이 필요합니다. Worker에 GITHUB_TOKEN을 등록하세요.' }, 503);
      let body;
      if (request.method !== 'GET') {
        const input = await readBody(request);
        if (issue) {
          if (input.state !== 'closed') return json({ message: '신고 닫기만 가능합니다.' }, 400);
          body = JSON.stringify({ state: 'closed' });
        } else {
          if (typeof input.content !== 'string' || typeof input.sha !== 'string' || typeof input.message !== 'string') return json({ message: '파일 요청이 올바르지 않습니다.' }, 400);
          body = JSON.stringify({ content: input.content, sha: input.sha, message: input.message });
        }
      }
      const query = target === 'issues' ? '?labels=report&state=open&per_page=100' : target === 'actions/runs' ? '?per_page=1' : '';
      const upstream = await fetch(`https://api.github.com/repos/${REPO}/${target}${query}`, {
        method: request.method, headers: { ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}), Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json', 'User-Agent': 'StarTube-Admin', 'X-GitHub-Api-Version': '2022-11-28' }, body,
      });
      if (!upstream.ok) return json({ message: `GitHub 요청 실패 (${upstream.status})` }, upstream.status === 401 ? 502 : upstream.status);
      return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    } catch (error) {
      return json({ message: error instanceof SyntaxError || error instanceof RangeError ? '요청 본문이 올바르지 않습니다.' : '관리자 요청을 처리하지 못했습니다.' }, error instanceof SyntaxError || error instanceof RangeError ? 400 : 502);
    }
  },
};

async function readBody(request) {
  // Bound both declared and streamed size to avoid unbounded request allocations.
  if (Number(request.headers.get('Content-Length')) > 131072) throw new RangeError('body too large');
  if (!request.body) throw new SyntaxError('missing body');
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 131072) { await reader.cancel(); throw new RangeError('body too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('invalid body');
  return parsed;
}
