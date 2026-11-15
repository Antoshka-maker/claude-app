// Mini App «Claude»: каркас. Каждый запрос к ноутбуку подписан Telegram (initData) — сервер знает, кто ты.
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  var root = document.getElementById('app');

  // Где сервер ноутбука. Если интерфейс открыт с GitHub Pages, адрес туннеля приходит в ?api=...
  // Пускаем только адреса известных туннелей — подпись Telegram не уйдёт на чужой сайт.
  var API = '';
  (function () {
    var a = new URLSearchParams(location.search).get('api') || '';
    if (/^https:\/\/[a-z0-9.-]+\.(pinggy-free\.link|pinggy\.link|pinggy\.online|trycloudflare\.com|tuna\.am)$/i.test(a)) API = a;
  })();
  var ON_PAGES = /github\.io$/i.test(location.hostname);

  // Все обращения к ноутбуку — с подписью Telegram и с пропуском мимо страницы-предупреждения Pinggy.
  function raw(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Init-Data': tg ? tg.initData : '', 'X-Pinggy-No-Screen': '1' }, opts.headers || {});
    return fetch(API + path, opts);
  }

  function applyTheme() {
    var dark = tg && tg.colorScheme === 'dark';
    document.documentElement.classList.toggle('dark', !!dark);
    var bg = dark ? '#262624' : '#FAF9F5';
    if (tg && tg.setHeaderColor) { try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); } catch (e) {} }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, opts) {
    return raw(path, opts).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('Ошибка ' + r.status)); });
      return r.json();
    });
  }

  function greeting() {
    var h = new Date().getHours();
    return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  }

  var SPARK = '<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><g stroke="#D97757" stroke-width="2.2" stroke-linecap="round">' +
    '<path d="M12 3v18"/><path d="M3 12h18"/><path d="M5.6 5.6l12.8 12.8"/><path d="M18.4 5.6L5.6 18.4"/></g></svg>';

  function renderHome(data) {
    var u = data.user;
    var name = (u.tg && u.tg.first_name) || u.name || 'друг';
    var t0 = performance.now();
    root.innerHTML =
      '<div class="hero">' + SPARK + '<h1>' + esc(greeting()) + ', ' + esc(name) + '</h1>' +
      '<div class="small">Пульт управления твоим Claude</div></div>' +
      '<div class="card row"><div class="avatar">' + esc(name[0] || '?') + '</div>' +
      '<div class="grow"><div style="font-weight:600">' + esc(u.name || name) + (u.is_owner ? ' <span class="small">· владелец</span>' : '') + '</div>' +
      '<div class="small">ID ' + esc(u.uid) + ' · чатов: ' + esc(u.chats) + '</div></div>' +
      '<span class="pill ok">доступ</span></div>' +
      '<div class="card"><div class="row"><div class="grow"><div style="font-weight:600">Связь с ноутбуком</div>' +
      '<div class="small" id="ping">проверяю скорость…</div></div><span class="pill ok">есть</span></div></div>' +
      '<div class="card"><h2>Скоро здесь</h2><div class="list" style="margin-top:8px">' +
      '<div>Чаты с поиском</div><div>Модель, мощность и скиллы для каждого чата</div>' +
      '<div>Лимиты, включая отдельный лимит Fable</div><div>Файлы каждого чата как на диске</div>' +
      '<div>Интерактивные графики из ответов</div>' + (u.is_owner ? '<div>Панель аккаунтов</div>' : '') +
      '</div></div>';
    // замер скорости: тянем ~200 КБ, чтобы заметить «режим 16 КБ» у провайдера
    api('/api/me').then(function () {
      var ms = Math.round(performance.now() - t0);
      return raw('/static/telegram-web-app.js', { cache: 'no-store' }).then(function (r) { return r.text(); })
        .then(function (txt) {
          var el = document.getElementById('ping');
          if (el) el.textContent = 'ответ за ' + ms + ' мс · файл ' + Math.round(txt.length / 1024) + ' КБ загрузился целиком';
        });
    }).catch(function (e) {
      var el = document.getElementById('ping'); if (el) { el.textContent = 'проблема: ' + e.message; el.className = 'small error'; }
    });
  }

  function renderError(msg) {
    root.innerHTML = '<div class="hero">' + SPARK + '<h1>Не получилось</h1></div>' +
      '<div class="card error">' + esc(msg) + '</div>' +
      '<button class="btn secondary" onclick="location.reload()">Обновить</button>';
  }

  if (tg) { tg.ready(); tg.expand(); applyTheme(); tg.onEvent('themeChanged', applyTheme); }
  if (!tg || !tg.initData) { renderError('Открой это приложение кнопкой «Claude» в боте Telegram.'); return; }
  if (ON_PAGES && !API) { renderError('Не знаю адрес ноутбука. Открой приложение кнопкой «Claude» в боте.'); return; }
  api('/api/me').then(renderHome).catch(function (e) {
    var m = e && e.message || '';
    if (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(m))
      m = 'Ноутбук не отвечает. Проверь, что бот запущен. Если бот перезапускался, закрой приложение и открой кнопкой «Claude» заново — адрес связи мог смениться.';
    renderError(m);
  });
})();
