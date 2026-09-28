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

const CACHE_NAME = 'vreyse-v5';

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
      // КРИТИЧЕСКИЙ файл — если не скачался, установка должна провалиться.
      const indexResponse = await fetch('./index.html', { cache: 'no-store' });
      if(!indexResponse || !indexResponse.ok){
        throw new Error('Не удалось загрузить index.html при установке новой версии');
      }
      await cache.put('./index.html', indexResponse.clone());
      await cache.put('./', indexResponse.clone());

      // НЕкритические файлы — сбой любого из них не должен рушить обновление.
      await Promise.allSettled(
        ['./manifest.json', './icon-192.png', './icon-512.png'].map(async (url) => {
          const response = await fetch(url, { cache: 'no-store' });
          if(response && response.ok) await cache.put(url, response);
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
