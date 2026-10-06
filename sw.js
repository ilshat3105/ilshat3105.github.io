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

const CACHE_NAME = 'vreyse-v7';

// ---- Защита от отката на более старый index.html ----
// Версия приложения — строка «Версия: ГГГГ-ММ-ДД ЧЧ:ММ» в #appVersionLine.
// Формат фиксированный, поэтому версии сравниваются как обычные строки.
// Правило: страница НИКОГДА не получает index.html с версией НИЖЕ самой новой,
// уже сохранённой на этом устройстве (ни из сети, ни из кэша), и такой ответ
// не кэшируется. Плохая сеть/устаревший CDN может открыть только последнюю
// успешно установленную копию, но не более старую.
const VERSION_RE = /id="appVersionLine"[^>]*>\s*Версия:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/;

async function versionOfResponse(response) {
  try {
    const text = await response.clone().text();
    const m = VERSION_RE.exec(text);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

// Самая новая сохранённая копия index.html среди ВСЕХ кэшей (старые кэши живут
// до activate, поэтому в install новая версия может взять копию из прежнего).
async function newestCachedIndex() {
  let best = null;
  let keys = [];
  try { keys = await caches.keys(); } catch (e) { return null; }
  for (const key of keys) {
    try {
      const cache = await caches.open(key);
      const response = await cache.match('./index.html');
      if (!response) continue;
      const version = await versionOfResponse(response);
      if (!version) continue;
      if (!best || version > best.version) best = { version, response };
    } catch (e) { /* пропускаем повреждённый кэш */ }
  }
  return best;
}

// Установка: скачиваем и сохраняем нужные файлы.
//
// Важно: НЕ используем cache.addAll() — он работает по принципу "всё или
// ничего": если хотя бы один из файлов (даже маленькая иконка) не скачается
// с первой попытки на слабой/нестабильной связи, весь addAll() целиком
// проваливается — а значит проваливается и вся установка новой версии.
// Старый service worker в этом случае остаётся работать как ни в чём не
// бывало, а новая версия появится только при следующей проверке — именно
// это, скорее всего, и даёт эффект "обновилось только через несколько
// перезапусков".
//
// Но и полностью глушить ошибки всех файлов подряд нельзя: index.html —
// САМЫЙ ГЛАВНЫЙ файл. Если его не удалось скачать, а ошибку молча
// проглотить, установка "успешно" завершится без него — после чего новый
// service worker активируется, имя кэша сменится (см. CACHE_NAME), и
// СТАРЫЙ рабочий кэш со старым index.html будет удалён при активации.
// В редком, но реальном случае получим активную новую версию, у которой
// в кэше нет вообще никакого index.html на случай офлайна/таймаута сети.
//
// Поэтому: index.html (и './', тот же документ) — обязателен, его ошибку
// НЕ глушим — если он не скачался, вся установка проваливается и старая
// рабочая версия остаётся работать, как и было задумано. А manifest.json
// и иконки — необязательны, их сбой не должен блокировать обновление.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // КРИТИЧЕСКИЙ файл. Берём сеть, но если она дала версию НИЖЕ уже
      // сохранённой (или вообще без версии), а в кэше есть более новая —
      // копируем в новый кэш именно более новую. Нет сети, но есть валидная
      // сохранённая версия — используем её. Нет ни сети, ни валидного кэша —
      // установка проваливается (старая рабочая версия продолжает работать).
      const best = await newestCachedIndex();
      let net = null, netVersion = null;
      try {
        const r = await fetch('./index.html', { cache: 'no-store' });
        if (r && r.ok) { net = r; netVersion = await versionOfResponse(r); }
      } catch (e) { /* сети нет — решим ниже */ }

      let chosen = null;
      if (net && (!best || (netVersion && netVersion >= best.version))) chosen = net;
      else if (best) chosen = best.response;
      if (!chosen) {
        throw new Error('Не удалось загрузить index.html и нет сохранённой копии');
      }
      await cache.put('./index.html', chosen.clone());
      await cache.put('./', chosen.clone());

      // НЕкритические файлы — сбой любого из них не должен рушить обновление.
      await Promise.allSettled(
        ['./manifest.json', './icon-192.png', './icon-512.png'].map(async (url) => {
          const response = await fetch(url, { cache: 'no-store' });
          if (response && response.ok) await cache.put(url, response);
        })
      );
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
//
// Важно: сам index.html — это ОДИН большой файл (всё приложение целиком,
// сотни килобайт), и именно его нужно скачать заново при каждом открытии
// или обновлении версии. В движущейся машине с постоянной сменой вышек
// сотовой связи 3.5 секунды на такой файл — мало: одна неудачная попытка
// на слабом сигнале в моменте — и обновление откатывается на старую
// сохранённую копию, даже если в среднем LTE вполне нормальный. Поэтому
// для самой страницы (index.html / './') даём заметно больше времени, чем
// для мелких файлов (иконки, manifest) — тем достаточно и короткого тайм-аута.
const FETCH_TIMEOUT_MS = 3500;
const NAVIGATION_FETCH_TIMEOUT_MS = 12000;

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

  // Важно: трогаем только запросы к СВОЕМУ сайту (файлы приложения).
  // Без этой проверки обработчик ниже перехватывал ВООБЩЕ ВСЕ запросы
  // со страницы, включая обращения к серверам Google (вход в аккаунт,
  // живая синхронизация Firestore, push-уведомления) — а у них СОВСЕМ
  // ДРУГОЙ адрес (не наш сайт). На слабом/нестабильном сигнале (не
  // обрыв связи, а просто задержки) 3.5-секундный таймер и запрет
  // брать что-то из обычного кэша браузера (cache: 'no-store') рвали
  // такие запросы посреди дела — из-за этого живое соединение с базой
  // данных без конца переподключалось заново, а вход в аккаунт (и
  // e-mail в шапке) появлялся с большой задержкой. Теперь такие чужие
  // запросы этот обработчик просто пропускает мимо — браузер
  // обрабатывает их сам, как обычно, без нашего вмешательства.
  const requestURL = new URL(event.request.url);
  if(requestURL.origin !== self.location.origin) return;

  // Запрос самой страницы (открытие приложения, "потянуть вниз", переход
  // после клика "Обновить") — даём ему увеличенный тайм-аут (см. выше),
  // остальным мелким файлам хватает обычного короткого.
  const isNavigation = event.request.mode === 'navigate'
    || event.request.destination === 'document'
    || requestURL.pathname.endsWith('/index.html');
  const timeoutMs = isNavigation ? NAVIGATION_FETCH_TIMEOUT_MS : FETCH_TIMEOUT_MS;

  if (isNavigation) {
    // Страница приложения: сеть может вернуть только версию НЕ ниже сохранённой.
    event.respondWith((async () => {
      const best = await newestCachedIndex();
      try {
        const response = await fetchWithTimeout(event.request, timeoutMs);
        if (best && !response.ok) return best.response;
        const netVersion = await versionOfResponse(response);
        if (best && (!netVersion || netVersion < best.version)) {
          // Старый (или непроверяемый) ответ сети: не кэшируем и не показываем.
          return best.response;
        }
        if (!response.ok) return response; // ошибочную страницу в кэш не кладём
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
        cache.put('./index.html', response.clone());
        return response;
      } catch (e) {
        if (best) return best.response;
        return (await caches.match(event.request)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  event.respondWith(
    fetchWithTimeout(event.request, timeoutMs)
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
