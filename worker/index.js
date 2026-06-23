// Edge auth gate for xaleth.dev
// ---------------------------------------------------------------------------
// Runs BEFORE any static file is served (see run_worker_first in wrangler.jsonc).
// Protected pages are never sent to the browser without a valid signed cookie.
// The password lives ONLY as a Cloudflare secret (env.SITE_PASSWORD) — it is
// never in the repo, the dist bundle, or any JS the browser downloads.
//
// To set / change the password (one time, persists across deploys):
//   npx wrangler secret put SITE_PASSWORD
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'xd_auth';
const SESSION_DAYS = 30; // how long a login lasts before re-auth

// --- What is protected -----------------------------------------------------
// 1) Anything under these prefixes is gated automatically. Drop a file in
//    public/private/ and it's protected the moment it deploys.
const PROTECTED_PREFIXES = ['/private/'];
// 2) One-off files anywhere else. Add a path here to gate a single page.
//    e.g. '/flavor-form-study.html'
const PROTECTED_PATHS = [];

function isProtected(pathname) {
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return PROTECTED_PATHS.includes(pathname);
}

// --- Crypto: sign/verify a tamper-proof session cookie ---------------------
const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Signing key is derived from the password, so changing the password also
// invalidates every existing session (a feature, not a bug).
async function signingKey(password) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(password));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function makeToken(password) {
  const exp = Date.now() + SESSION_DAYS * 86400 * 1000;
  const payload = String(exp);
  const key = await signingKey(password);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${payload}.${toHex(sig)}`;
}

async function verifyToken(token, password) {
  if (!token || !token.includes('.')) return false;
  const [payload, sigHex] = token.split('.');
  const exp = Number(payload);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const key = await signingKey(password);
  const expected = toHex(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
  if (expected.length !== sigHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sigHex.charCodeAt(i);
  }
  return diff === 0;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

async function isAuthed(request, env) {
  if (!env.SITE_PASSWORD) return false;
  return verifyToken(readCookie(request, COOKIE_NAME), env.SITE_PASSWORD);
}

function cookieHeader(value, maxAgeSeconds) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join('; ');
}

// --- Login page (themed to match the site) ---------------------------------
function loginPage({ next, error } = {}) {
  const safeNext = next && next.startsWith('/') ? next : '/';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>xaleth.dev · access</title>
<style>
  :root{
    --bg:#080d1a; --surface:#0d1526; --cyan:#00d4ff; --gold:#f5a623;
    --text:#ffffff; --text2:#7eb8cc; --muted:#2a4a5a;
    --font-mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{
    background:var(--bg);color:var(--text);font-family:var(--font-mono);
    display:flex;align-items:center;justify-content:center;padding:24px;
    -webkit-font-smoothing:antialiased;
  }
  .card{
    width:100%;max-width:360px;background:var(--surface);
    border:1px solid rgba(0,212,255,0.4);padding:36px 28px;
    box-shadow:0 0 24px rgba(0,212,255,0.15);
  }
  .title{font-size:24px;font-weight:800;letter-spacing:4px;margin-bottom:4px}
  .kicker{font-size:11px;letter-spacing:3px;color:var(--text2);
    text-transform:uppercase;margin-bottom:28px}
  label{display:block;font-size:11px;letter-spacing:2px;color:var(--text2);
    text-transform:uppercase;margin-bottom:8px}
  input{
    width:100%;background:rgba(8,13,26,0.6);border:1px solid rgba(0,212,255,0.4);
    color:var(--text);font-family:var(--font-mono);font-size:14px;
    padding:12px 14px;letter-spacing:2px;outline:none;
  }
  input:focus{border-color:rgba(0,212,255,0.9);box-shadow:0 0 8px rgba(0,212,255,0.3)}
  button{
    width:100%;margin-top:20px;background:transparent;cursor:pointer;
    border:1px solid rgba(245,166,35,0.6);color:var(--gold);
    font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:2px;
    padding:13px;text-transform:uppercase;transition:.15s;
  }
  button:hover{border-color:var(--gold);box-shadow:0 0 10px rgba(245,166,35,0.35)}
  .error{margin-top:16px;font-size:12px;color:#ff6b6b;letter-spacing:1px;min-height:14px}
  .home{display:block;margin-top:22px;text-align:center;font-size:11px;
    letter-spacing:2px;color:var(--muted);text-decoration:none}
  .home:hover{color:var(--text2)}
</style>
</head>
<body>
  <form class="card" method="POST" action="/login">
    <div class="title">XALETH.DEV</div>
    <div class="kicker">Enter access key</div>
    <label for="password">Access key</label>
    <input id="password" name="password" type="password" autofocus autocomplete="current-password" />
    <input type="hidden" name="next" value="${safeNext.replace(/"/g, '&quot;')}" />
    <button type="submit">Unlock →</button>
    <div class="error">${error ? 'Incorrect access key.' : ''}</div>
    <a class="home" href="/">← back to home</a>
  </form>
</body>
</html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// --- Request handler -------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Lightweight endpoint so the artifacts UI can show/hide lock badges.
    if (path === '/api/auth-status') {
      const authed = await isAuthed(request, env);
      return new Response(JSON.stringify({ authed }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // Logout: clear the cookie.
    if (path === '/logout') {
      return new Response(null, {
        status: 302,
        headers: { Location: '/', 'Set-Cookie': cookieHeader('', 0) },
      });
    }

    // Login.
    if (path === '/login') {
      const next = url.searchParams.get('next') || '/';
      if (request.method === 'GET') {
        // Already logged in? Skip the form.
        if (await isAuthed(request, env)) {
          return new Response(null, { status: 302, headers: { Location: next } });
        }
        return loginPage({ next });
      }
      if (request.method === 'POST') {
        const form = await request.formData();
        const password = String(form.get('password') || '');
        const dest = String(form.get('next') || '/');
        const safeDest = dest.startsWith('/') ? dest : '/';
        if (env.SITE_PASSWORD && password === env.SITE_PASSWORD) {
          const token = await makeToken(env.SITE_PASSWORD);
          return new Response(null, {
            status: 302,
            headers: {
              Location: safeDest,
              'Set-Cookie': cookieHeader(token, SESSION_DAYS * 86400),
            },
          });
        }
        return loginPage({ next: safeDest, error: true });
      }
    }

    // Gate protected paths.
    if (isProtected(path) && !(await isAuthed(request, env))) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/login?next=${encodeURIComponent(path)}` },
      });
    }

    // Everything else: serve the static asset.
    return env.ASSETS.fetch(request);
  },
};
