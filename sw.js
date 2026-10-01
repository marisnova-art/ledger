/* LEDGER — Service Worker
   - 앱 셸(index.html·매니페스트·아이콘)을 미리 저장해 오프라인에서도 실행
   - 페이지 요청: 네트워크 우선(최신 버전 반영) → 실패/지연 시 저장본
   - 글꼴·라이브러리 CDN: 저장본 즉시 사용 + 뒤에서 갱신(stale-while-revalidate)
   - Supabase API(동기화)와 GET이 아닌 요청은 절대 가로채거나 저장하지 않음
   배포할 때 index.html을 바꿨다면 VERSION 숫자를 올려 주세요. */
const VERSION = 'ledger-v1.0.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const RUNTIME_MAX = 160;
const NAV_TIMEOUT = 3500;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'esm.sh', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // 하나가 실패해도 나머지는 저장되도록 개별 처리
    await Promise.all(SHELL_FILES.map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* 다음 방문 때 다시 시도 */ }
    }));
  })());
  // 첫 설치는 바로 활성화, 업데이트는 사용자가 "새로고침"을 누를 때 활성화
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('ledger-') && !k.startsWith(VERSION)).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // 동기화 서버(Supabase)는 항상 실시간 — 캐시 금지
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (CDN_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(staleWhileRevalidate(event, req));
  }
});

async function handleNavigate(event) {
  const cache = await caches.open(SHELL);
  const network = (async () => {
    const preload = await event.preloadResponse;
    const res = preload || await fetch(event.request);
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(cache.put('./index.html', copy));
    }
    return res;
  })();
  event.waitUntil(network.catch(() => {}));
  try {
    const res = await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT))
    ]);
    if (res) return res;
  } catch (e) { /* 오프라인이거나 느림 → 저장본 */ }
  const cached = await cache.match('./index.html') || await cache.match('./');
  if (cached) return cached;
  try { return await network; }
  catch (e) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LEDGER</title>' +
      '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0C0D0B;color:#F1F2EC;font-family:system-ui,sans-serif;text-align:center">' +
      '<div><h1 style="font-size:22px">오프라인이에요</h1><p style="color:#8E9088">처음 한 번은 인터넷에 연결된 상태로 열어야 해요.</p>' +
      '<button onclick="location.reload()" style="margin-top:12px;padding:12px 22px;border:0;border-radius:999px;background:#D4FF3A;color:#131A00;font-weight:700;font-size:15px">다시 시도</button></div></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return Response.error();
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const update = fetch(req).then(async res => {
    if (res && (res.ok || res.type === 'opaque')) {
      await cache.put(req, res.clone());
      trim(cache);
    }
    return res;
  }).catch(() => null);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  const res = await update;
  return res || Response.error();
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= RUNTIME_MAX) return;
  await Promise.all(keys.slice(0, keys.length - RUNTIME_MAX).map(k => cache.delete(k)));
}
