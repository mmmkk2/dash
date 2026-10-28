// 설치형 앱(PWA)용 서비스 워커
// - 화면(HTML)은 항상 네트워크 먼저 → 배포하면 바로 새 버전, 오프라인이면 마지막 화면
// - 빌드 파일(/assets/, 이름에 해시 포함)은 한 번 받으면 캐시에서
// - Supabase·/api 등 데이터 요청은 건드리지 않음
const CACHE = 'dash-v12'
// 내비서 주소로 중계하는 앤딩 관리자 화면은 건드리지 않는다
const PASS = /^\/(andingapp(\/|$)|admin$|viewer$|login$|logout$)/

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || PASS.test(url.pathname)) return

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req)
        const cache = await caches.open(CACHE)
        cache.put('/index.html', res.clone())
        return res
      } catch {
        return (await caches.match('/index.html')) || Response.error()
      }
    })())
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
      return res
    })())
  }
})
