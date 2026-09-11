// ---- Push-уведомления (Firebase Cloud Messaging), фоновый режим ----
// Пока приложение свёрнуто (не открыта ни одна вкладка), именно этот файл
// получает пуш и обязан показать хоть какое-то уведомление — иначе браузер
// сам подставит системное "Сайт обновился в фоне", которое выглядит хуже.
// Делаем уведомление максимально тихим и незаметным: без звука по умолчанию,
// с автоматическим скрытием.
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAVcifT9Ip69CSuSt_8naJHr4ZbplOMtgI",
  authDomain: "v-reyse.firebaseapp.com",
  projectId: "v-reyse",
  storageBucket: "v-reyse.firebasestorage.app",
  messagingSenderId: "200272195894",
  appId: "1:200272195894:web:6139f885fb49e0e747c397"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(() => {
  self.registration.showNotification('В рейсе', {
    body: 'Данные обновлены',
    icon: './icon-192.png',
    silent: true,
    tag: 'vreyse-sync' // одинаковый tag — новое уведомление заменяет предыдущее, не копится
  });
});

const CACHE_NAME = 'vreyse-v1';

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
// Важно: cache: 'no-store' заставляет сам fetch() игнорировать
// HTTP-кэш браузера (тот, что настраивается заголовками, а не тот,
// что чистится через "Очистить данные сайта") — без этого браузер мог
// молча отдавать старую версию из своего кэша даже при рабочей сети,
// пока пользователь не чистил кэш вручную.
//
// Важно: у fetch() нет своего таймаута — на слабом сигнале (не полный
// офлайн, а просто "почти нет связи") запрос может просто зависать и
// ждать ответа десятки секунд, прежде чем сорвётся сам. FETCH_TIMEOUT_MS
// ниже обрывает ожидание раньше и сразу переключает на кэш, чтобы
// приложение не "зависало", а быстро открывалось из сохранённой копии.
const FETCH_TIMEOUT_MS = 3500;

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request, { cache: 'no-store' }).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetchWithTimeout(event.request, FETCH_TIMEOUT_MS)
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
