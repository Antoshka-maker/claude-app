// Mini App «Claude»: чаты прямо в приложении. Каждый запрос к ноутбуку подписан Telegram (initData).
(function () {
  'use strict';
  var tg = window.Telegram && window.Telegram.WebApp;
  function $(s) { return document.querySelector(s); }
  var esc = MD.esc;

  // ---------- связь с ноутбуком ----------
  // Интерфейс лежит на GitHub Pages, адрес ноутбука приходит в ?api=... Пускаем только адреса известных туннелей.
  var Q = new URLSearchParams(location.search);
  function okApi(a) { return /^https:\/\/[a-z0-9.-]+\.(pinggy-free\.link|pinggy\.link|pinggy\.online|trycloudflare\.com|tuna\.am)$/i.test(a || ''); }
  var API = okApi(Q.get('api')) ? Q.get('api') : '';
  var ON_PAGES = /github\.io$/i.test(location.hostname);
  // репозиторий, где бот держит текущий адрес ноутбука (api.json) — на случай, если туннель сменил адрес
  var REPO = ON_PAGES ? { owner: location.hostname.split('.')[0],
    repo: location.pathname.split('/')[1] || location.hostname } : null;

  function raw(path, opts, ms) {
    opts = Object.assign({}, opts || {});
    opts.headers = Object.assign({ 'X-Init-Data': tg ? tg.initData : '', 'X-Pinggy-No-Screen': '1' }, opts.headers || {});
    var ctl = window.AbortController ? new AbortController() : null, t = null, ext = opts.signal;
    if (ctl) {
      opts.signal = ctl.signal; t = setTimeout(function () { ctl.abort(); }, ms || 25000);
      if (ext) { if (ext.aborted) ctl.abort(); else ext.addEventListener('abort', function () { ctl.abort(); }); }
    }
    return fetch(API + path, opts).then(function (r) { clearTimeout(t); return r; },
                                        function (e) { clearTimeout(t); throw e; });
  }
  var relocating = null;
  function relocate() {
    if (!REPO) return Promise.resolve(false);
    if (!relocating) {
      relocating = fetch('https://api.github.com/repos/' + REPO.owner + '/' + REPO.repo + '/contents/api.json',
                         { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw+json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var u = j && j.api;
          if (!okApi(u) || u === API) return false;
          API = u;
          try { var q = new URLSearchParams(location.search); q.set('api', u);
                history.replaceState(null, '', location.pathname + '?' + q.toString() + location.hash); } catch (e) {}
          toast('Адрес ноутбука сменился — переподключился');
          return true;
        })
        .catch(function () { return false; })
        .then(function (v) { setTimeout(function () { relocating = null; }, 3000); return v; });
    }
    return relocating;
  }
  // запрос с поиском нового адреса, если старый перестал отвечать
  function rawRetry(path, opts, ms) {
    return raw(path, opts, ms).then(function (r) {
      // туннель жив, но адрес уже чужой/пустой (страница Pinggy вместо нашего сервера)
      var ct = r.headers.get('Content-Type') || '';
      if (!r.ok && r.status !== 401 && r.status !== 403 && /text\/html/.test(ct)) {
        return relocate().then(function (ch) { return ch ? raw(path, opts, ms) : r; });
      }
      return r;
    }, function (e) {
      if (!isNetErr(e) || (opts && opts.signal && opts.signal.aborted)) throw e;
      return relocate().then(function (ch) { if (ch) return raw(path, opts, ms); throw e; });
    });
  }
  function api(path, opts, ms) {
    return rawRetry(path, opts, ms).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { var e = new Error(t || ('Ошибка ' + r.status)); e.status = r.status; throw e; });
      return r.json();
    });
  }
  function post(path, body, signal) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: signal });
  }
  function isNetErr(e) {
    return !!e && (e.name === 'AbortError' || e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|aborted/i.test(e.message || ''));
  }

  // ---------- состояние ----------
  var S = { me: null, chats: [], key: null, title: '', msgs: [], seq: 0, busy: false, steps: [], live: '', started: 0,
            polling: false, sending: false, fails: 0, openSteps: false, stick: true, stopping: false,
            settings: { model: 'opus', effort: 'high', style: 'normal', research: false }, att: [],
            incognito: false, project: null, projects: [], skills: null, query: '', found: null };
  var sendCtl = null;
  var CFG = { models: [], efforts: [], styles: [], defaults: null, owner: false };
  var feed = $('#feed'), input = $('#input'), sendBtn = $('#b-send');
  var DESKTOP = tg && /^(tdesktop|macos|web|weba|webk|unigram)$/.test(tg.platform || '');

  // ---------- оформление и Telegram ----------
  function applyTheme() {
    var light = tg && tg.colorScheme === 'light';
    document.documentElement.className = light ? 'light' : 'dark';
    var bg = light ? '#FAF9F5' : '#181817';
    try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); if (tg.setBottomBarColor) tg.setBottomBarColor(bg); } catch (e) {}
  }
  function haptic(kind) { try { tg.HapticFeedback.impactOccurred(kind || 'light'); } catch (e) {} }
  function toast(text, ms) {
    var t = $('#toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }
  function setNet(text) { var n = $('#net'); n.hidden = !text; n.textContent = text || ''; }

  // ---------- приветствие и осьминожка ----------
  var OCTO = '<svg class="octo" viewBox="0 0 120 120" role="img" aria-label="Рыжий осьминожка"><g fill="#D97757">' +
    '<path d="M60 14c-22 0-36 15-36 34 0 10 4 18 10 24h52c6-6 10-14 10-24 0-19-14-34-36-34z"/>' +
    '<path d="M34 70c-6 8-14 12-20 10-3-1-2 4 2 6 8 4 18-1 24-9z"/><path d="M44 72c-3 10-2 20-8 26-2 2 1 5 4 3 8-5 11-16 12-27z"/>' +
    '<path d="M56 73c0 11 1 22-3 30-1 3 3 4 5 2 5-8 6-20 6-31z"/><path d="M64 73c0 11-1 22 3 30 1 3 5 2 5-1-3-8-2-19-2-29z"/>' +
    '<path d="M76 72c1 11 4 22 12 27 3 2 6-1 4-3-6-6-5-16-8-26z"/><path d="M86 70c6 8 16 13 24 9 4-2 5-7 2-6-6 2-14-2-20-10z"/></g>' +
    '<ellipse cx="60" cy="58" rx="22" ry="10" fill="#E8956F" opacity="0.6"/>' +
    '<ellipse cx="48" cy="44" rx="6.5" ry="8" fill="#FFFFFF"/><ellipse cx="72" cy="44" rx="6.5" ry="8" fill="#FFFFFF"/>' +
    '<circle cx="49.5" cy="46" r="3.6" fill="#1F1E1D"/><circle cx="73.5" cy="46" r="3.6" fill="#1F1E1D"/>' +
    '<circle cx="51" cy="44.5" r="1.2" fill="#FFFFFF"/><circle cx="75" cy="44.5" r="1.2" fill="#FFFFFF"/>' +
    '<path d="M54 56q6 5 12 0" fill="none" stroke="#1F1E1D" stroke-width="2.2" stroke-linecap="round"/>' +
    '<ellipse cx="40" cy="54" rx="4" ry="2.5" fill="#F2B49A" opacity="0.8"/><ellipse cx="80" cy="54" rx="4" ry="2.5" fill="#F2B49A" opacity="0.8"/></svg>';
  var greetI = Math.floor(Math.random() * 10);
  function greeting() {
    var n = (S.me && S.me.name) || '';
    var sets = {
      night: ['Привет, ночная сова', n ? 'Не спится, ' + n + '?' : 'Не спится?', 'Ночью лучше думается', 'Что обдумаем, пока тихо?'],
      morning: ['Доброе утро, ранняя пташка', n ? 'Доброе утро, ' + n : 'Доброе утро', 'С чего начнём день?'],
      day: ['Что обдумаем?', 'Чем займёмся?', 'С чего начнём?', 'Над чем работаем?'],
      evening: [n ? 'Добрый вечер, ' + n : 'Добрый вечер', 'Что обдумаем вечером?', 'Как прошёл день?']
    };
    var h = new Date().getHours();
    var list = sets[h < 5 ? 'night' : h < 11 ? 'morning' : h < 18 ? 'day' : 'evening'];
    return list[greetI % list.length];
  }

  // ---------- иконки ----------
  var I = {
    chat: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 5h14v10H9l-4 4z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
    retry: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0114-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 01-14 5.3L4 15"/><path d="M4 20v-5h5"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 4 4H6l4-4z"/><path d="M12 14v6"/></svg>',
    pinOn: '<svg class="pin" viewBox="0 0 24 24"><path d="M9 4h6l-1 6 4 4H6l4-4zM11.2 14h1.6v6h-1.6z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>',
    move: '<svg viewBox="0 0 24 24"><path d="M6 4h12M5 7h14"/><rect x="4" y="10" width="16" height="10" rx="2"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    check: '<svg class="ck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    photo: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    style: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h7"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" style="margin-left:auto;width:18px;height:18px"><path d="M9 6l6 6-6 6"/></svg>'
  };

  // ---------- боковое меню ----------
  function openDrawer(on) {
    document.getElementById('app').classList.toggle('drawer-open', !!on);
    if (tg && tg.BackButton) { if (on && innerWidth < 900) tg.BackButton.show(); else tg.BackButton.hide(); }
    if (on) loadChats();
  }
  var NAV = [
    ['projects', 'Проекты', '<svg class="ico" viewBox="0 0 24 24"><path d="M6 4h12M5 7h14"/><rect x="4" y="10" width="16" height="10" rx="2"/></svg>'],
    ['skills', 'Скиллы', '<svg class="ico" viewBox="0 0 24 24"><path d="M14.5 4.5l5 5-10 10H4.5v-5z"/><path d="M12 7l5 5"/></svg>'],
    ['memory', 'Память', '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>'],
    ['files', 'Файлы', '<svg class="ico" viewBox="0 0 24 24"><path d="M4 5h6l2 2h8v12H4z"/></svg>'],
    ['limits', 'Лимиты', '<svg class="ico" viewBox="0 0 24 24"><path d="M5 19V11M12 19V5M19 19v-6"/></svg>'],
    ['accounts', 'Аккаунты', '<svg class="ico" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 13.8c1.8.7 3 2.6 3 5.2"/></svg>', 'owner']
  ];
  function hl(text, q) {
    var t = esc(text); if (!q) return t;
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? t : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  function renderChats() {
    var box = $('#chatlist');
    var q = S.query.trim();
    if (q) {
      var local = S.chats.filter(function (c) { return c.title.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
      var seen = {}; local.forEach(function (c) { seen[c.key] = 1; });
      var deep = (S.found || []).filter(function (r) { return !seen[r.key]; });
      box.innerHTML = (local.length ? '<div class="dr-sec">В названиях</div>' + local.map(function (c) {
          return '<button type="button" class="ci" data-key="' + esc(c.key) + '">' + I.chat + '<span class="t">' + hl(c.title, q) + '</span></button>';
        }).join('') : '') +
        (deep.length ? '<div class="dr-sec">В тексте чатов</div>' + deep.map(function (r) {
          return '<button type="button" class="ci" data-key="' + esc(r.key) + '">' + I.chat + '<span class="t">' + esc(r.title) +
            '<span class="sub">' + hl(r.snippet, q) + '</span></span></button>';
        }).join('') : '') +
        (!local.length && !deep.length ? '<div class="dr-empty">' + (S.found === null ? 'Ищу…' : 'Ничего не нашлось') + '</div>' : '');
      return;
    }
    var nav = '<div class="dr-nav">' + NAV.filter(function (n) { return !n[3] || (S.me && S.me.owner); }).map(function (n) {
      return '<button type="button" class="ci" data-page="' + n[0] + '">' + n[2] + '<span class="t">' + n[1] + '</span></button>';
    }).join('') + '</div><div class="dr-div"></div>';
    if (!S.chats.length) { box.innerHTML = nav + '<div class="dr-empty">Чатов пока нет. Напиши что-нибудь — чат появится здесь.</div>'; return; }
    function item(c) {
      return '<button type="button" class="ci' + (c.key === S.key ? ' on' : '') + '" data-key="' + esc(c.key) + '">' + I.chat +
        '<span class="t">' + esc(c.title) + '</span>' + (c.src === 'tg' ? '<span class="tag">TG</span>' : '') +
        (c.busy ? '<span class="dot"></span>' : '') + '</button>';
    }
    var pinned = S.chats.filter(function (c) { return c.pinned; }), rest = S.chats.filter(function (c) { return !c.pinned; });
    box.innerHTML = nav + (pinned.length ? '<div class="dr-sec">Закреплённые</div>' + pinned.map(item).join('') : '') +
      (rest.length ? '<div class="dr-sec">Недавние</div>' + rest.map(item).join('') : '');
  }
  var searchT = null;
  function onSearch() {
    S.query = $('#q').value; S.found = null; renderChats();
    clearTimeout(searchT);
    if (S.query.trim().length < 2) { S.found = []; renderChats(); return; }
    var q = S.query;
    searchT = setTimeout(function () {
      api('/api/search?q=' + encodeURIComponent(q)).then(function (r) { if (S.query === q) { S.found = r.results || []; renderChats(); } })
        .catch(function () { S.found = []; renderChats(); });
    }, 350);
  }
  $('#q').addEventListener('input', onSearch);
  function closeSearch() { $('#searchbar').hidden = true; $('#q').value = ''; S.query = ''; S.found = null; renderChats(); }
  function loadChats() {
    api('/api/projects').then(function (r) { S.projects = r.projects || []; setTitle(); }).catch(function () {});
    return api('/api/chats').then(function (r) { S.chats = r.chats || []; renderChats(); }).catch(function () {});
  }

  // ---------- лента ----------
  var imgCache = {};
  function fileUrl(key, name) {
    var k = key + '/' + name;
    if (!imgCache[k]) imgCache[k] = rawRetry('/api/chats/' + encodeURIComponent(key) + '/file?name=' + encodeURIComponent(name))
      .then(function (r) { if (!r.ok) throw new Error(); return r.blob(); }).then(function (b) { return URL.createObjectURL(b); });
    return imgCache[k];
  }
  function filesHtml(files) {
    if (!files || !files.length) return '';
    return '<div class="files">' + files.map(function (f) {
      return /\.(png|jpe?g|gif|webp)$/i.test(f) ? '<img data-file="' + esc(f) + '" alt="' + esc(f) + '">'
        : '<span class="chip" data-f="' + esc(f) + '" title="' + esc(f) + '">📎 ' + esc(f.replace(/^\d{4}_/, '')) + '</span>';
    }).join('') + '</div>';
  }
  function mountFiles(el, key) {
    el.querySelectorAll('img[data-file]').forEach(function (img) {
      var name = img.getAttribute('data-file');
      fileUrl(key, name).then(function (u) { img.src = u; }).catch(function () {
        var c = document.createElement('span'); c.className = 'chip'; c.textContent = '📎 ' + name.replace(/^\d{4}_/, '') + ' — нет на ноутбуке';
        img.replaceWith(c);
      });
    });
  }

  // рисунки из ответа: SVG и HTML — в отдельной «песочнице», химия — картинкой с ноутбука
  var wid = 0;
  function frameDoc(kind, code, id) {
    var light = document.documentElement.className === 'light';
    var vars = light ? '--color-text-primary:#141413;--color-text-secondary:#5E5D59;--color-background-primary:#FFFFFF;--color-background-secondary:#F5F4ED;--color-border-tertiary:#DEDCD1;color:#141413'
      : '--color-text-primary:#F2F1EC;--color-text-secondary:#A3A19A;--color-background-primary:#232322;--color-background-secondary:#2B2B29;--color-border-tertiary:#3A3A37;color:#F2F1EC';
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
      'html,body{margin:0;padding:0;background:transparent;font-family:system-ui,sans-serif;' + vars + ';--font-sans:system-ui,sans-serif}' +
      'body>svg{width:100%;height:auto;display:block}</style></head><body>' + code +
      '<script>function h(){parent.postMessage({wid:' + id + ',h:Math.ceil(document.documentElement.getBoundingClientRect().height)},"*")}' +
      'window.addEventListener("load",h);setTimeout(h,60);setTimeout(h,400);setTimeout(h,1500);' +
      'try{new ResizeObserver(h).observe(document.body)}catch(e){}<\/script></body></html>';
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d.wid !== 'number' || typeof d.h !== 'number') return;
    var f = document.querySelector('iframe[data-wid="' + d.wid + '"]');
    if (f && e.source === f.contentWindow) {
      f.style.height = Math.min(Math.max(d.h, 40), 2400) + 'px';
      if (S.stick) feed.scrollTop = feed.scrollHeight;   // рисунок вырос — лента остаётся внизу
    }
  });
  function mountWidgets(el, blocks, live) {
    el.querySelectorAll('.widget[data-w]').forEach(function (w) {
      var b = blocks[+w.getAttribute('data-w')];
      if (!b) return;
      if (live || !b.closed) { w.innerHTML = '<div class="wait">🎨 Рисую…</div>'; return; }
      if (b.kind === 'smiles') {
        w.innerHTML = '<div class="wait">🧪 Рисую формулу…</div>';
        rawRetry('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'smiles', code: b.code }) })
          .then(function (r) { if (!r.ok) throw new Error(); return r.blob(); })
          .then(function (bl) { w.innerHTML = '<img class="pic" alt="Структурная формула">'; w.firstChild.src = URL.createObjectURL(bl); })
          .catch(function () { w.innerHTML = '<div class="code"><div class="code-h"><span>smiles</span></div><pre><code>' + esc(b.code) + '</code></pre></div>'; });
        return;
      }
      var id = ++wid;
      var f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.setAttribute('data-wid', id);
      f.setAttribute('loading', 'lazy');
      f.srcdoc = frameDoc(b.kind, b.code, id);
      w.innerHTML = ''; w.appendChild(f);
    });
  }

  function msgNode(m) {
    var el = document.createElement('div');
    el.setAttribute('data-id', m.id);
    if (m.role === 'user') {
      el.className = 'm-user';
      el.innerHTML = (m.text ? '<div class="bubble">' + esc(m.text) + '</div>' : '') + filesHtml(m.files) +
        (m.local && m.local.length ? '<div class="files">' + m.local.map(function (a) {
          return a.preview ? '<img src="' + a.preview + '" alt="">' : '<span class="chip">📎 ' + esc(a.name) + '</span>';
        }).join('') + '</div>' : '');
    } else {
      el.className = 'm-ai';
      var r = MD.render(m.text);
      el.innerHTML = '<div class="md">' + r.html + '</div>' + filesHtml(m.files) +
        '<div class="actions"><button type="button" data-act="copy" aria-label="Копировать">' + I.copy + '</button>' +
        '<button type="button" data-act="retry" aria-label="Повторить" hidden>' + I.retry + '</button></div>';
      el._text = m.text;
      mountWidgets(el, r.blocks, false);
    }
    mountFiles(el, S.key);
    return el;
  }

  feed.addEventListener('scroll', function () { S.stick = nearBottom(); }, { passive: true });
  // картинки и рисунки догружаются позже — если лента была внизу, остаёмся внизу
  var ro = window.ResizeObserver ? new ResizeObserver(function () { if (S.stick) feed.scrollTop = feed.scrollHeight; }) : null;
  function nearBottom() { return feed.scrollHeight - feed.scrollTop - feed.clientHeight < 140; }
  function toBottom(force) {
    if (force || nearBottom()) { S.stick = true; requestAnimationFrame(function () { feed.scrollTop = feed.scrollHeight; }); }
  }

  function renderHome() {
    feed.innerHTML = '<div class="home">' + OCTO + '<button type="button" class="greet" id="greet">' + esc(greeting()) + '</button></div>';
  }

  function renderFeed() {
    if (!S.key && !S.msgs.length) { renderHome(); return; }
    var home = feed.querySelector('.home, .loading'); if (home) feed.innerHTML = '';
    var have = {};
    feed.querySelectorAll('[data-id]').forEach(function (n) { have[n.getAttribute('data-id')] = n; });
    var lastAi = -1;
    S.msgs.forEach(function (m, i) { if (m.role === 'assistant') lastAi = i; });
    var prev = null;
    S.msgs.forEach(function (m, i) {
      var id = String(m.id);
      var n = have[id];
      if (!n) { n = msgNode(m); if (prev) prev.after(n); else feed.insertBefore(n, feed.firstChild); if (ro) ro.observe(n); }
      delete have[id];
      var rb = n.querySelector('[data-act="retry"]');
      if (rb) rb.hidden = !(i === lastAi && i === S.msgs.length - 1 && !S.busy);
      prev = n;
    });
    Object.keys(have).forEach(function (k) { have[k].remove(); });
    renderLive();
  }

  function fmtTime(sec) { sec = Math.max(0, sec | 0); return Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2); }
  function renderLive() {
    var n = feed.querySelector('.m-ai.live');
    if (!S.busy) { if (n) n.remove(); return; }
    if (!n) {
      n = document.createElement('div'); n.className = 'm-ai live';
      n.innerHTML = '<button type="button" class="thinking"><span class="spin"></span><span class="t"></span>' + I.chev +
        '</button><ul class="steps"></ul><div class="md"></div>';
      feed.appendChild(n); if (ro) ro.observe(n);
    }
    var th = n.querySelector('.thinking');
    th.classList.toggle('open', S.openSteps);
    var last = S.steps.length ? S.steps[S.steps.length - 1] : '';
    th.querySelector('.t').textContent = (S.stopping ? 'Останавливаю' : S.live ? 'Пишу' : 'Думаю') + '… ' + fmtTime((Date.now() - S.started) / 1000) +
      (last && !S.live ? ' · ' + last.replace(/^\S+\s/, '') : '');
    n.querySelector('.steps').innerHTML = S.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var md = n.querySelector('.md');
    if (md._src !== S.live) {
      md._src = S.live;
      var r = MD.render(S.live);
      md.innerHTML = r.html;
      if (S.live) md.lastElementChild && md.lastElementChild.classList.add('cursor');
      mountWidgets(md, r.blocks, true);
    }
  }
  setInterval(function () { if (S.busy) renderLive(); }, 1000);

  function modelName(id) { var m = CFG.models.filter(function (x) { return x.id === id; })[0]; return m ? m.name : id; }
  function effortName(id) { var e = CFG.efforts.filter(function (x) { return x.id === id; })[0]; return e ? e.name : ''; }
  function updateChip() {
    $('#m-name').textContent = modelName(S.settings.model);
    $('#m-eff').textContent = effortName(S.settings.effort);
    $('#b-research').hidden = !S.settings.research;
  }
  function saveSettings(patch) {
    Object.assign(S.settings, patch); updateChip();
    if (S.key) post('/api/chats/' + encodeURIComponent(S.key) + '/settings', patch).catch(function (e) { toast(e.message); });
  }
  function modelSheet() {
    var html = '<div class="sh-lbl">Модель</div>' + CFG.models.map(function (m) {
      return '<button type="button" class="opt" data-set-model="' + m.id + '"><span><div class="t1">' + esc(m.name) +
        '</div><div class="t2">' + esc(m.desc) + '</div></span>' + (m.id === S.settings.model ? I.check : '') + '</button>';
    }).join('') + '<div class="sh-lbl">Мощность: <b>' + esc(effortName(S.settings.effort)) +
      '</b> — чем выше, тем глубже думает и тем больше тратит лимит</div><div class="seg">' +
      CFG.efforts.map(function (e, i) {
        var bars = '';
        for (var k = 0; k < 5; k++) bars += '<rect x="' + (2 + k * 7) + '" y="' + (16 - k * 3) + '" width="4.5" height="' + (6 + k * 3) +
          '" rx="1.5"' + (k <= i ? '' : ' opacity=".25"') + '/>';
        return '<button type="button" data-set-effort="' + e.id + '" aria-label="' + esc(e.name) + '"' + (e.id === S.settings.effort ? ' class="on"' : '') +
          '><svg viewBox="0 0 37 24" width="37" height="24" fill="currentColor">' + bars + '</svg></button>';
      }).join('') + '</div><button type="button" class="sh-link" data-menu="defaults">Сделать выбором для новых чатов</button>';
    sheet('Модель и мощность', html);
  }
  function plusSheet() {
    var st = CFG.styles.filter(function (x) { return x.id === S.settings.style; })[0];
    sheet('', '<button type="button" class="sh-item" data-pick="cam">' + I.camera + 'Камера</button>' +
      '<button type="button" class="sh-item" data-pick="photo">' + I.photo + 'Фото</button>' +
      '<button type="button" class="sh-item" data-pick="any">' + I.file + 'Файлы</button><div class="sh-sep"></div>' +
      '<button type="button" class="sh-item" data-menu="research">' + I.search + 'Глубокое исследование<span class="sw' +
      (S.settings.research ? ' on' : '') + '"></span></button>' +
      '<button type="button" class="sh-item" data-menu="styles">' + I.style + 'Стиль ответа<small>' + esc(st ? st.name : '') + '</small></button>');
  }
  function styleSheet() {
    sheet('Стиль ответа', CFG.styles.map(function (x) {
      return '<button type="button" class="opt" data-set-style="' + x.id + '"><span><div class="t1">' + esc(x.name) +
        '</div><div class="t2">' + esc(x.desc) + '</div></span>' + (x.id === S.settings.style ? I.check : '') + '</button>';
    }).join(''));
  }

  // ---------- вложения ----------
  function renderAtt() {
    var box = $('#attach');
    box.hidden = !S.att.length;
    box.innerHTML = S.att.map(function (a, i) {
      var img = a.preview ? '<img src="' + a.preview + '" alt="">' : '';
      return '<div class="att' + (img ? ' img' : '') + (a.state === 'up' ? ' up' : '') + (a.state === 'bad' ? ' bad' : '') + '" title="' + esc(a.name) + '">' +
        (img || (I.file.replace('<svg', '<svg style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;flex-shrink:0"') +
        '<span class="nm">' + esc(a.name) + '</span>')) + (a.state === 'up' ? '<span class="spin2"></span>' : '') +
        '<button type="button" class="x" data-unatt="' + i + '" aria-label="Убрать">×</button></div>';
    }).join('');
    setBusyUI();
  }
  function addFiles(list) {
    Array.prototype.forEach.call(list || [], function (f) {
      if (S.att.length >= 10) { toast('Не больше 10 файлов за раз'); return; }
      if (f.size > 100 * 1024 * 1024) { toast('«' + f.name + '» больше 100 МБ'); return; }
      var a = { name: f.name || 'файл', state: 'up', preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : '' };
      S.att.push(a); renderAtt();
      var fd = new FormData(); fd.append('file', f, f.name || 'файл');
      rawRetry('/api/upload', { method: 'POST', body: fd }, 180000).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t); });
        return r.json();
      }).then(function (j) { a.id = j.id; a.state = 'ok'; renderAtt(); })
        .catch(function (e) { a.state = 'bad'; renderAtt(); toast('Не загрузилось: ' + a.name); });
    });
  }
  ['#f-any', '#f-photo', '#f-cam'].forEach(function (sel) {
    $(sel).addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  });

  function projectName(pid) { var p = S.projects.filter(function (x) { return x.id === pid; })[0]; return p ? p.name : ''; }
  function setTitle() {
    var t = $('#title');
    var pn = S.project ? projectName(S.project) : '';
    if (S.incognito) t.innerHTML = esc(S.key ? (S.title || 'Инкогнито') : 'Инкогнито') + '<span class="badge">не сохранится</span>';
    else if (S.key) t.innerHTML = esc(S.title || 'Новый чат') + (pn ? '<span class="badge">' + esc(pn) + '</span>' : '');
    else t.innerHTML = pn ? '<span class="badge" style="margin:0">Проект: ' + esc(pn) + '</span>' : '';
    document.getElementById('app').classList.toggle('incognito', !!S.incognito);
    var g = $('#b-ghost'); g.hidden = !!S.key; g.classList.toggle('on', !!S.incognito);
    input.placeholder = S.incognito ? 'Инкогнито: чат не сохранится' : 'Напишите Claude';
  }
  function setBusyUI() {
    sendBtn.classList.toggle('stop', (S.busy || S.sending) && !input.value.trim() && !S.att.length);
    sendBtn.innerHTML = sendBtn.classList.contains('stop') ? I.stop : I.send;
    sendBtn.setAttribute('aria-label', sendBtn.classList.contains('stop') ? 'Остановить' : 'Отправить');
    var isStop = sendBtn.classList.contains('stop');
    var uploading = S.att.some(function (a) { return a.state === 'up'; });
    var ready = input.value.trim() || S.att.some(function (a) { return a.state === 'ok'; });
    sendBtn.disabled = isStop ? S.stopping : (S.sending || uploading || !ready);
  }

  // ---------- открыть чат / новый чат ----------
  function leaveIncognito() {
    if (S.incognito && S.key) post('/api/chats/' + encodeURIComponent(S.key) + '/close').catch(function () {});
  }
  function newChat(opts) {
    opts = opts || {};
    leaveIncognito();
    S.incognito = !!opts.incognito; S.project = opts.project || null;
    S.key = null; S.title = ''; S.msgs = []; S.busy = false; S.steps = []; S.live = ''; S.seq = 0;
    if (CFG.defaults) S.settings = Object.assign({}, CFG.defaults);
    updateChip();
    setTitle(); renderFeed(); renderChats(); setBusyUI(); openDrawer(false);
    if (!('ontouchstart' in window)) input.focus();
    try { history.replaceState(null, '', location.pathname + location.search.replace(/([?&])chat=[^&]*&?/, '$1').replace(/[?&]$/, '') + location.hash); } catch (e) {}
  }
  function openChat(key) {
    if (key !== S.key) leaveIncognito();
    S.incognito = false; S.project = null;
    closePage();
    S.key = key; S.msgs = []; S.busy = false; S.live = ''; S.steps = [];
    var c = S.chats.filter(function (x) { return x.key === key; })[0];
    S.title = c ? c.title : '';
    setTitle(); feed.innerHTML = '<div class="loading">Загружаю…</div>'; renderChats(); openDrawer(false); setBusyUI();
    return api('/api/chats/' + encodeURIComponent(key)).then(function (r) {
      if (S.key !== key) return;
      S.title = r.title; S.msgs = r.messages || []; S.seq = r.seq; S.busy = r.busy; S.steps = r.steps || []; S.live = r.text || '';
      if (r.settings) { S.settings = r.settings; updateChip(); }
      S.project = r.project || null;
      S.started = Date.now() - (r.elapsed || 0) * 1000;
      setTitle(); feed.innerHTML = ''; renderFeed(); setBusyUI(); toBottom(true);
      if (S.busy) poll();
    }).catch(function (e) {
      if (S.key !== key) return;
      feed.innerHTML = '<div class="loading err">' + esc(isNetErr(e) ? 'Ноутбук не отвечает' : e.message) + '</div>';
    });
  }
  function reloadMessages() {
    var key = S.key;
    return api('/api/chats/' + encodeURIComponent(key)).then(function (r) {
      if (S.key !== key) return;
      S.msgs = r.messages || []; S.title = r.title; S.busy = r.busy;
      if (!S.busy) { S.live = ''; S.steps = []; }
      setTitle(); renderFeed(); setBusyUI(); toBottom();
    });
  }

  // ---------- отправка и живой ответ ----------
  function send(textArg) {
    var text = (textArg != null ? textArg : input.value).trim();
    var files = textArg != null ? [] : S.att.filter(function (a) { return a.state === 'ok'; });
    if ((!text && !files.length) || S.sending) return;
    if (textArg == null && S.att.some(function (a) { return a.state === 'up'; })) { toast('Дождись, пока файлы загрузятся'); return; }
    S.sending = true; haptic('light');
    if (textArg == null) { input.value = ''; autosize(); }
    var wasNew = !S.key;
    if (wasNew) feed.innerHTML = '';
    S.msgs.push({ id: 'tmp' + Date.now(), role: 'user', text: text, files: [], local: files });
    if (textArg == null) { S.att = []; renderAtt(); }
    S.busy = true; S.steps = []; S.live = ''; S.started = Date.now(); S.openSteps = false;
    renderFeed(); setBusyUI(); toBottom(true);
    var cid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    sendCtl = window.AbortController ? new AbortController() : null;
    post('/api/send', { key: S.key, text: text, cid: cid,
                        settings: S.key ? null : Object.assign({}, S.settings, { incognito: S.incognito, project: S.project }),
                        files: files.map(function (a) { return a.id; }) }, sendCtl && sendCtl.signal).then(function (r) {
      S.sending = false; sendCtl = null;
      if (!r.ok) {
        S.busy = false; S.msgs.pop(); renderFeed(); setBusyUI(); toast(r.error || 'Не отправилось', 4000);
        if (textArg == null && !input.value) { input.value = text; autosize(); }
        if (textArg == null && !S.att.length) { S.att = files; renderAtt(); }
        return;
      }
      if (wasNew) { S.key = r.key; S.title = S.incognito ? 'Инкогнито' : r.title; S.seq = r.seq; setTitle(); loadChats(); }
      poll();
      setBusyUI();
    }).catch(function (e) {
      var cancelled = sendCtl && sendCtl.signal.aborted;
      S.sending = false; S.busy = false; S.stopping = false; sendCtl = null; S.msgs.pop();
      if (wasNew && !S.key) renderHome(); else renderFeed();
      if (textArg == null && !input.value) { input.value = text; autosize(); }
      if (textArg == null && !S.att.length && files.length) { S.att = files; renderAtt(); }
      setBusyUI();
      toast(cancelled ? 'Отменено' : isNetErr(e) ? 'Ноутбук не отвечает — сообщение не ушло' : e.message, 4000);
    });
  }

  function handle(ev) {
    if (ev.t === 'start') { S.busy = true; S.started = Date.now(); S.steps = []; S.live = ''; }
    else if (ev.t === 'queued') { S.steps.push('📥 В очереди — жду предыдущий ответ'); }
    else if (ev.t === 'step') { S.steps.push(ev.text); }
    else if (ev.t === 'delta') { S.live = ev.text; }
    else if (ev.t === 'done') { S.busy = false; S.stopping = false; S.live = ''; S.steps = []; haptic('medium'); reloadMessages(); loadChats(); }
    else if (ev.t === 'title') { if (!S.incognito) { S.title = ev.text; setTitle(); loadChats(); } }
  }

  function poll() {
    if (S.polling || !S.key) return;
    S.polling = true;
    var key = S.key;
    (function loop() {
      if (S.key !== key) { S.polling = false; return; }
      api('/api/chats/' + encodeURIComponent(key) + '/events?after=' + S.seq + '&wait=20', null, 40000).then(function (r) {
        if (S.key !== key) { S.polling = false; return; }
        if (S.fails) { S.fails = 0; setNet(''); }
        var stick = nearBottom();
        (r.events || []).forEach(function (ev) { if (ev.seq > S.seq) handle(ev); });
        S.seq = Math.max(S.seq, r.seq);
        if (S.busy && !r.busy && !(r.events || []).length) { S.busy = false; reloadMessages(); }
        renderLive(); setBusyUI();
        if (stick) toBottom(true);
        if (S.busy || r.busy) loop(); else S.polling = false;
      }).catch(function (e) {
        S.fails++;
        if (S.fails >= 6) setNet('Нет связи с ноутбуком. Проверь, что бот на ноутбуке запущен — переподключусь сам.');
        else if (S.fails >= 2) setNet('Связь пропала, пробую снова…');
        setTimeout(loop, Math.min(1500 * S.fails, 6000));
      });
    })();
  }

  function stopRun() {
    haptic('rigid');
    if (S.sending && sendCtl) { sendCtl.abort(); return; }      // сообщение ещё не дошло — просто отменяем
    if (!S.key) { S.busy = false; renderFeed(); setBusyUI(); return; }
    S.stopping = true; renderLive(); setBusyUI();
    var key = S.key;
    post('/api/chats/' + encodeURIComponent(key) + '/stop').then(function (r) {
      if (!r.ok && S.key === key) {                              // на ноутбуке уже ничего не идёт
        S.stopping = false; S.busy = false; reloadMessages();
      }
    }).catch(function () { S.stopping = false; setBusyUI(); renderLive(); toast('Не смог остановить — нет связи с ноутбуком'); });
  }

  // ---------- меню чата: долгое нажатие или правая кнопка ----------
  function sheet(title, html) {
    var sh = $('#sheet');
    sh.querySelector('.sheet-title').textContent = title || '';
    sh.querySelector('.sheet-body').innerHTML = html;
    sh.hidden = false;
    if (tg && tg.BackButton) tg.BackButton.show();
  }
  function closeSheet() {
    $('#sheet').hidden = true;
    if (tg && tg.BackButton && !document.getElementById('app').classList.contains('drawer-open') && $('#page').hidden) tg.BackButton.hide();
  }
  function chatMenu(key) {
    var c = S.chats.filter(function (x) { return x.key === key; })[0] || { key: key, title: S.title };
    haptic('medium');
    sheet(c.title, '<button type="button" class="sh-item" data-menu="pin" data-key="' + esc(key) + '">' + I.pin +
      (c.pinned ? 'Открепить' : 'Закрепить') + '</button>' +
      '<button type="button" class="sh-item" data-menu="rename" data-key="' + esc(key) + '">' + I.edit + 'Переименовать</button>' +
      '<button type="button" class="sh-item" data-menu="move" data-key="' + esc(key) + '">' + I.move + 'Переместить в проект</button>' +
      '<button type="button" class="sh-item" data-menu="export" data-key="' + esc(key) + '">' + I.file + 'Прислать переписку в Telegram</button>' +
      '<button type="button" class="sh-item danger" data-menu="delete" data-key="' + esc(key) + '">' + I.trash + 'Удалить</button>');
  }
  function confirmAsk(text, cb) {
    if (tg && tg.showConfirm) { try { tg.showConfirm(text, cb); return; } catch (e) {} }
    cb(window.confirm(text));
  }
  function menuAction(act, key) {
    var c = S.chats.filter(function (x) { return x.key === key; })[0] || { title: S.title };
    var path = '/api/chats/' + encodeURIComponent(key);
    if (act === 'pin') {
      closeSheet();
      post(path + '/pin', { on: !c.pinned }).then(function () { toast(c.pinned ? 'Откреплён' : 'Закреплён'); loadChats(); })
        .catch(function (e) { toast(e.message); });
    } else if (act === 'rename') {
      sheet('Новое название', '<input class="sh-input" id="rn" maxlength="60" value="' + esc(c.title || '') + '">' +
        '<div class="sh-row"><button type="button" class="sh-btn" data-menu="cancel">Отмена</button>' +
        '<button type="button" class="sh-btn main" data-menu="rename-ok" data-key="' + esc(key) + '">Сохранить</button></div>');
      var inp = $('#rn'); inp.focus(); inp.select();
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') menuAction('rename-ok', key); });
    } else if (act === 'rename-ok') {
      var title = ($('#rn') || {}).value || '';
      if (!title.trim()) return;
      closeSheet();
      post(path + '/rename', { title: title }).then(function (r) {
        if (S.key === key) { S.title = r.title; setTitle(); }
        loadChats(); toast('Переименовал');
      }).catch(function (e) { toast(e.message); });
    } else if (act === 'delete') {
      closeSheet();
      confirmAsk('Удалить чат «' + (c.title || 'без названия') + '»?' + (c.src === 'tg' ? ' Тема в Telegram тоже удалится.' : '') +
        ' Папка с историей 30 дней полежит в корзине на ноутбуке.', function (yes) {
        if (!yes) return;
        post(path + '/delete').then(function (r) {
          if (S.key === key) newChat();
          loadChats(); toast(r.note || 'Удалён', r.note ? 5000 : 2000);
        }).catch(function (e) { toast(e.message); });
      });
    } else if (act === 'move') {
      api('/api/projects').then(function (r) {
        S.projects = r.projects || [];
        var cur = (key === S.key) ? S.project : null;
        sheet('Переместить в проект', (S.projects.length ? S.projects.map(function (p) {
          return '<button type="button" class="opt" data-move-to="' + esc(p.id) + '" data-key="' + esc(key) + '"><span class="pdot" style="width:12px;height:12px;border-radius:6px;background:' +
            esc(p.color) + '"></span><span><div class="t1">' + esc(p.name) + '</div></span>' + (p.id === cur ? I.check : '') + '</button>';
        }).join('') : '<div class="empty">Проектов пока нет</div>') +
          '<button type="button" class="opt" data-move-to="" data-key="' + esc(key) + '"><span><div class="t1">Без проекта</div></span></button>' +
          '<button type="button" class="sh-link" data-page="projects">Создать проект</button>');
      }).catch(function (e) { toast(e.message); });
    } else if (act === 'export') {
      closeSheet();
      post(path + '/to-telegram', {}).then(function () { toast('Прислал файл с перепиской в чат с ботом'); }).catch(function (e) { toast(e.message); });
    } else if (act === 'cancel') closeSheet();
    else if (act === 'research') { saveSettings({ research: !S.settings.research }); plusSheet(); }
    else if (act === 'styles') styleSheet();
    else if (act === 'defaults') {
      post('/api/defaults', S.settings).then(function (r) { CFG.defaults = r.defaults; toast('Новые чаты будут с этой моделью'); closeSheet(); })
        .catch(function (e) { toast(e.message); });
    }
  }
  // после долгого нажатия палец ещё на экране: клики глотаем, пока его не отпустят (+0,35 с), чтобы «отпускание»
  // не нажало случайно пункт меню под пальцем
  var press = null, suppressUntil = 0, lastTouch = 0;
  function guardUntilRelease() { suppressUntil = Infinity; setTimeout(function () { if (suppressUntil === Infinity) suppressUntil = 0; }, 2500); }
  document.addEventListener('touchstart', function (e) {
    lastTouch = Date.now();
    var ci = e.target.closest('.ci[data-key]'); if (!ci) return;
    var tch = e.touches[0];
    press = { x: tch.clientX, y: tch.clientY, t: setTimeout(function () { guardUntilRelease(); press = null; chatMenu(ci.getAttribute('data-key')); }, 480) };
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!press) return;
    var tch = e.touches[0];
    if (Math.abs(tch.clientX - press.x) > 10 || Math.abs(tch.clientY - press.y) > 10) { clearTimeout(press.t); press = null; }
  }, { passive: true });
  document.addEventListener('touchend', function () {
    if (press) { clearTimeout(press.t); press = null; }
    if (suppressUntil === Infinity) suppressUntil = Date.now() + 350;
  }, { passive: true });
  document.addEventListener('contextmenu', function (e) {
    var ci = e.target.closest('.ci[data-key]');
    if (!ci) return;
    e.preventDefault();
    if (Date.now() - lastTouch < 1500 && press !== false) guardUntilRelease();   // долгое нажатие пальцем, а не правая кнопка мыши
    if ($('#sheet').hidden) chatMenu(ci.getAttribute('data-key'));
  });

  // ---------- поле ввода ----------
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, innerHeight * 0.4) + 'px';
    setBusyUI();
  }
  function slashMenu() {
    var box = $('#slash');
    var m = input.value.match(/^\/([^\s]*)$/);
    if (!m) { box.hidden = true; return; }
    if (S.skills === null) {
      S.skills = [];
      api('/api/skills').then(function (r) { S.skills = r.skills || []; slashMenu(); }).catch(function () {});
    }
    var q = m[1].toLowerCase();
    var list = S.skills.filter(function (x) { return !q || x.id.toLowerCase().indexOf(q) >= 0 || (x.name || '').toLowerCase().indexOf(q) >= 0; });
    box.hidden = !list.length && !q;
    box.innerHTML = list.length ? list.map(function (x) {
      return '<button type="button" data-slash="' + esc(x.id) + '"><b>/' + esc(x.id) + '</b><small>' + esc(x.desc || x.name) + '</small></button>';
    }).join('') : '<div class="empty" style="padding:12px">Скилла «' + esc(q) + '» нет. Скиллы — в меню слева.</div>';
  }
  input.addEventListener('input', function () { autosize(); slashMenu(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && DESKTOP) { e.preventDefault(); send(); }
  });
  input.addEventListener('focus', function () { setTimeout(function () { toBottom(true); }, 300); });
  sendBtn.addEventListener('click', function () {
    if (sendBtn.classList.contains('stop')) stopRun(); else send();
  });

  // ---------- клики ----------
  function copyText(text) {
    function fallback() {
      var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback); else fallback();
    toast('Скопировано'); haptic('light');
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (Date.now() < suppressUntil) { suppressUntil = 0; e.preventDefault(); return; }   // палец отпустили после долгого нажатия
    var mi = t.closest('[data-menu]'); if (mi) { menuAction(mi.getAttribute('data-menu'), mi.getAttribute('data-key')); return; }
    var sm = t.closest('[data-set-model]'); if (sm) { saveSettings({ model: sm.getAttribute('data-set-model') }); modelSheet(); haptic('light'); return; }
    var se = t.closest('[data-set-effort]'); if (se) { saveSettings({ effort: se.getAttribute('data-set-effort') }); modelSheet(); haptic('light'); return; }
    var ss = t.closest('[data-set-style]'); if (ss) { saveSettings({ style: ss.getAttribute('data-set-style') }); closeSheet(); toast('Стиль: ' + ss.querySelector('.t1').textContent); return; }
    var pk = t.closest('[data-pick]'); if (pk) { closeSheet(); $('#f-' + pk.getAttribute('data-pick')).click(); return; }
    var ua = t.closest('[data-unatt]'); if (ua) { S.att.splice(+ua.getAttribute('data-unatt'), 1); renderAtt(); return; }
    var pgb = t.closest('[data-page]'); if (pgb) { closeSheet(); openDrawer(false); openPage(pgb.getAttribute('data-page')); return; }
    var mv = t.closest('[data-move-to]');
    if (mv) {
      var mk = mv.getAttribute('data-key'), to = mv.getAttribute('data-move-to') || null;
      closeSheet();
      post('/api/chats/' + encodeURIComponent(mk) + '/move', { project: to }).then(function () {
        if (mk === S.key) { S.project = to; setTitle(); }
        toast(to ? 'Перенёс в «' + projectName(to) + '»' : 'Убрал из проекта'); loadChats();
      }).catch(function (e) { toast(e.message); });
      return;
    }
    if (t.closest('#b-search')) { var sb = $('#searchbar'); sb.hidden = !sb.hidden; if (!sb.hidden) $('#q').focus(); else closeSearch(); return; }
    if (t.closest('#q-x')) { closeSearch(); return; }
    if (t.closest('#b-ghost')) { S.incognito = !S.incognito; setTitle(); haptic('light');
      toast(S.incognito ? 'Инкогнито: этот чат не сохранится и не попадёт в память' : 'Обычный чат'); return; }
    var sl = t.closest('[data-slash]'); if (sl) { input.value = '/' + sl.getAttribute('data-slash') + ' '; input.focus(); autosize(); slashMenu(); return; }
    if (t.closest('#b-model')) { modelSheet(); return; }
    if (t.closest('#b-plus')) { plusSheet(); return; }
    if (t.closest('#b-research')) { saveSettings({ research: false }); toast('Исследование выключено'); return; }
    if (t.closest('#sheet') && !t.closest('.sheet-card')) { closeSheet(); return; }
    if (t.closest('#title') && S.key) { chatMenu(S.key); return; }
    var a = t.closest('a[data-ext]');
    if (a) { e.preventDefault(); if (tg && tg.openLink) tg.openLink(a.href); else window.open(a.href, '_blank'); return; }
    if (t.closest('#b-menu')) return openDrawer(true);
    if (t.closest('#scrim')) return openDrawer(false);
    if (t.closest('#b-new') || t.closest('#dr-new')) return newChat();
    var ci = t.closest('.ci[data-key]'); if (ci) return openChat(ci.getAttribute('data-key'));
    if (t.closest('#greet')) { greetI++; $('#greet').textContent = greeting(); return; }
    var cp = t.closest('[data-copy]'); if (cp) { copyText(cp.closest('.code').querySelector('code').textContent); return; }
    var act = t.closest('[data-act]');
    if (act) {
      var msg = act.closest('.m-ai');
      if (act.getAttribute('data-act') === 'copy') copyText(msg._text || '');
      if (act.getAttribute('data-act') === 'retry') {
        var lastUser = S.msgs.filter(function (m) { return m.role === 'user'; }).pop();
        if (lastUser && !S.busy) send(lastUser.text);
      }
      return;
    }
    var th = t.closest('.thinking'); if (th) { S.openSteps = !S.openSteps; renderLive(); return; }
    var chip = t.closest('.files .chip[data-f]');
    if (chip && APP.fileMenu) { APP.fileMenu(S.key, chip.getAttribute('data-f')); return; }
    var img = t.closest('.files img, .widget .pic');
    if (img && img.src) { var v = $('#viewer'); v.querySelector('img').src = img.src; v.hidden = false; return; }
    if (t.closest('#viewer')) { $('#viewer').hidden = true; return; }
  });

  // ---------- для экранов (pages.js) ----------
  var pageStack = [];
  function openPage(name, arg) { if (window.PAGES && PAGES[name]) { pageStack.push([name, arg]); PAGES[name](arg); } }
  function closePage() { pageStack = []; $('#page').hidden = true; }
  function backPage() {
    pageStack.pop();
    var prev = pageStack.pop();
    if (prev) openPage(prev[0], prev[1]); else closePage();
  }
  $('#pg-back').addEventListener('click', backPage);
  window.APP = { S: S, CFG: function () { return CFG; }, apiBase: function () { return API || location.origin; }, api: api, post: post, rawRetry: rawRetry, esc: esc, toast: toast,
    sheet: sheet, closeSheet: closeSheet, confirmAsk: confirmAsk, haptic: haptic, openChat: openChat, newChat: newChat,
    loadChats: loadChats, openPage: openPage, closePage: closePage, backPage: backPage, I: I, md: MD,
    page: function (title, html, act) {
      var pg = $('#page'); pg.hidden = false;
      pg.querySelector('.pg-title').textContent = title || '';
      pg.querySelector('.pg-act').innerHTML = act || '';
      pg.querySelector('.pg-body').innerHTML = html;
      pg.querySelector('.pg-body').scrollTop = 0;
      if (tg && tg.BackButton) tg.BackButton.show();
      return pg.querySelector('.pg-body');
    } };

  // ---------- старт ----------
  function fatal(msg) {
    feed.innerHTML = '<div class="home">' + OCTO + '<div class="greet" style="font-size:24px">Не получилось</div>' +
      '<div class="err">' + esc(msg) + '</div></div>';
    $('#composer').style.display = 'none';
  }
  if (tg) {
    tg.ready(); tg.expand(); applyTheme();
    tg.onEvent('themeChanged', applyTheme);
    if (tg.disableVerticalSwipes) try { tg.disableVerticalSwipes(); } catch (e) {}
    if (tg.BackButton) tg.BackButton.onClick(function () {
      if (!$('#sheet').hidden) closeSheet();
      else if (!$('#page').hidden) backPage();
      else openDrawer(false);
    });
  }
  if (!tg || !tg.initData) return fatal('Открой это приложение кнопкой «Claude» в боте Telegram.');
  if (ON_PAGES && !API) return fatal('Не знаю адрес ноутбука. Открой приложение кнопкой «Claude» в боте.');

  api('/api/me').then(function (r) {
    var u = r.user || {};
    S.me = { name: (u.tg && u.tg.first_name) || u.name || '', uid: u.uid, owner: u.is_owner };
    $('#me-av').textContent = (S.me.name || '?').charAt(0).toUpperCase();
    return api('/api/config').then(function (c) { CFG = c; S.settings = Object.assign({}, c.defaults); updateChip(); })
      .catch(function () {}).then(function () { return r; });
  }).then(function () {
    loadChats();
    var want = Q.get('chat');
    if (want) openChat(want); else newChat();
    if (innerWidth >= 900) openDrawer(true);
  }).catch(function (e) {
    fatal(isNetErr(e) ? 'Ноутбук не отвечает. Проверь, что бот запущен. Если бот перезапускался, закрой приложение и открой кнопкой «Claude» заново — адрес связи мог смениться.' : e.message);
  });
})();
