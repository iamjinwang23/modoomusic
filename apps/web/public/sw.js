// MONO Service Worker — 설치성(PWA) + 웹 푸시 수신.
// 캐싱은 하지 않음(네트워크 우선) — 음악앱이라 오프라인 가치 낮고 Next 자산 캐시 리스크 회피.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// fetch 리스너 존재 = 설치 가능 기준 충족. respondWith 안 함 → 브라우저 기본 처리.
self.addEventListener('fetch', () => {})

// 웹 푸시 수신 → 알림 표시
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = {} }
  const title = data.title || '모두의 노래'
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon-192x192.png',
    badge: '/favicon-192x192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 알림 클릭 → 해당 URL 포커스/열기
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientsArr) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        try { await client.navigate(url) } catch (e) {}
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
