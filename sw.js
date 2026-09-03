// Service Worker для приложения "В рейсе"
// Кэширует основные файлы, чтобы приложение открывалось без интернета.

const CACHE_NAME = 'v-reyse-cache-v2';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Установка: скачиваем и сохраняем нужные файлы
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Активация: удаляем старые версии кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Запросы: сначала пробуем сеть (чтобы видеть свежую версию),
// если сети нет — отдаём сохранённую копию из кэша.
//
// Важно: cache: 'no-store' заставляет сам fetch() игнорировать обычный
// HTTP-кэш браузера (тот, что настраивается заголовками сервера и не связан
// с "Очистить данные сайта") — без этого браузер мог молча подсовывать
// версию из своего кэша даже при рабочей сети, и обновление не было видно,
// пока пользователь не чистил кэш вручную.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('./index.html');
        });
      })
  );
});
