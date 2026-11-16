// Отдельные экраны приложения: проекты, скиллы, память, файлы, лимиты, аккаунты.
(function () {
  'use strict';
  var A = window.APP; if (!A) return;
  var esc = A.esc;
  function enc(x) { return encodeURIComponent(x); }
  function fail(e) { A.toast(e && e.message ? e.message : 'Не получилось'); }
  function loading(title) { A.page(title, '<div class="empty">Загружаю…</div>'); }
  var PROJ_ICON = '<svg viewBox="0 0 24 24"><path d="M6 4h12M5 7h14"/><rect x="4" y="10" width="16" height="10" rx="2"/></svg>';

  function ask(title, label, value, cb, multiline) {
    A.sheet(title, (multiline ? '<textarea class="ta" id="ask-in" style="min-height:140px">' + esc(value || '') + '</textarea>'
      : '<input class="sh-input" id="ask-in" maxlength="80" value="' + esc(value || '') + '" placeholder="' + esc(label || '') + '">') +
      '<div class="sh-row"><button type="button" class="sh-btn" id="ask-no">Отмена</button><button type="button" class="sh-btn main" id="ask-ok">Готово</button></div>');
    var inp = document.getElementById('ask-in'); inp.focus();
    document.getElementById('ask-no').onclick = A.closeSheet;
    document.getElementById('ask-ok').onclick = function () { var v = inp.value.trim(); if (!v) return; A.closeSheet(); cb(v); };
    if (!multiline) inp.onkeydown = function (e) { if (e.key === 'Enter') document.getElementById('ask-ok').click(); };
  }

  function pickFile(cb, multiple) {
    var f = document.createElement('input'); f.type = 'file'; if (multiple) f.multiple = true;
    f.onchange = function () { cb(f.files); }; f.click();
  }
  function uploadTo(path, file) {
    var fd = new FormData(); fd.append('file', file, file.name || 'файл');
    return A.rawRetry(path, { method: 'POST', body: fd }, 180000).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || 'Ошибка загрузки'); });
      return r.json();
    });
  }

  var P = window.PAGES = {};

  // ---------- проекты ----------
  P.projects = function () {
    loading('Проекты');
    A.api('/api/projects').then(function (r) {
      A.S.projects = r.projects || [];
      var body = A.page('Проекты', '<div class="pg-h">Проекты</div><p class="pg-sub">У чатов проекта общие правила, файлы и память — ' +
        'Claude помнит контекст проекта во всех его чатах.</p>' +
        '<button type="button" class="btn" id="np" style="width:100%;margin-bottom:14px">+ Новый проект</button>' +
        (A.S.projects.length ? A.S.projects.map(function (p) {
          return '<button type="button" class="pcard" data-proj="' + esc(p.id) + '"><span class="sq" style="background:' + esc(p.color) + '">' + PROJ_ICON +
            '</span><span class="t"><b>' + esc(p.name) + '</b><small>' + esc(p.desc || '') + (p.desc ? ' · ' : '') + p.chats + ' ' + plural(p.chats, 'чат', 'чата', 'чатов') + '</small></span></button>';
        }).join('') : '<div class="empty">Пока нет ни одного проекта</div>'));
      body.querySelector('#np').onclick = function () {
        ask('Новый проект', 'Название, например «Органическая химия»', '', function (name) {
          A.post('/api/projects', { name: name }).then(function (r) { A.loadChats(); A.openPage('project', r.id); }).catch(fail);
        });
      };
      body.querySelectorAll('[data-proj]').forEach(function (b) { b.onclick = function () { A.openPage('project', b.getAttribute('data-proj')); }; });
    }).catch(fail);
  };

  function plural(n, a, b, c) { n = Math.abs(n) % 100; var d = n % 10; return n > 10 && n < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; }

  P.project = function (pid) {
    loading('Проект');
    A.api('/api/projects/' + enc(pid)).then(function (p) {
      var body = A.page(p.name, '<div class="pg-h">' + esc(p.name) + '</div>' + (p.desc ? '<p class="pg-sub">' + esc(p.desc) + '</p>' : '') +
        '<button type="button" class="btn" id="pc-new" style="width:100%;margin-bottom:14px">+ Новый чат в проекте</button>' +
        '<div class="card"><h3>Правила проекта</h3><div class="muted" style="margin-bottom:8px">Как Claude должен работать во всех чатах проекта: роль, стиль, что учитывать.</div>' +
        '<textarea class="ta" id="pc-rules" placeholder="Например: объясняй механизмы реакций подробно, рисуй структурные формулы">' + esc(stripHead(p.rules)) + '</textarea>' +
        '<div class="btn-row"><button type="button" class="btn sec" id="pc-rules-save">Сохранить правила</button></div></div>' +
        '<div class="card"><h3>Файлы проекта<span class="grow"></span><button type="button" class="btn sec" id="pc-up" style="height:36px;padding:0 12px">+ Файл</button></h3>' +
        '<div class="muted" style="margin-bottom:6px">Конспекты, методички, задания — Claude читает их во всех чатах проекта.</div>' +
        (p.files.length ? p.files.map(function (f) {
          return '<div class="row-btn"><span class="t">📎 ' + esc(f) + '</span><button type="button" class="btn danger" style="height:32px;padding:0 10px" data-pf-del="' + esc(f) + '">Удалить</button></div>';
        }).join('') : '<div class="muted">Файлов нет</div>') + '</div>' +
        '<div class="card"><h3>Память проекта</h3><div class="muted" style="margin-bottom:8px">Общее для всех чатов проекта. Claude дописывает сюда важное сам — это и есть «координатор»: другие чаты проекта это видят.</div>' +
        '<textarea class="ta" id="pc-mem">' + esc(stripHead(p.memory)) + '</textarea>' +
        '<div class="btn-row"><button type="button" class="btn sec" id="pc-mem-save">Сохранить память</button></div></div>' +
        '<div class="card"><h3>Чаты проекта</h3>' + (p.chats.length ? p.chats.map(function (c) {
          return '<button type="button" class="row-btn" data-open="' + esc(c.key) + '"><span class="t">' + esc(c.title) + '</span></button>';
        }).join('') : '<div class="muted">Пока нет. Начни новый чат в проекте или перенеси существующий (долгое нажатие на чат → «Переместить в проект»).</div>') + '</div>' +
        '<div class="btn-row"><button type="button" class="btn sec" id="pc-ren">Переименовать</button><button type="button" class="btn sec" id="pc-desc">Описание</button>' +
        '<button type="button" class="btn danger" id="pc-del">Удалить проект</button></div>');
      function save(patch, msg) { return A.post('/api/projects/' + enc(pid), patch).then(function () { A.toast(msg); }).catch(fail); }
      body.querySelector('#pc-new').onclick = function () { A.closePage(); A.newChat({ project: pid }); };
      body.querySelector('#pc-rules-save').onclick = function () { save({ rules: '# Правила проекта\n' + body.querySelector('#pc-rules').value }, 'Правила сохранены'); };
      body.querySelector('#pc-mem-save').onclick = function () { save({ memory: '# Память проекта\n' + body.querySelector('#pc-mem').value }, 'Память сохранена'); };
      body.querySelector('#pc-up').onclick = function () {
        pickFile(function (files) {
          A.toast('Загружаю…');
          Promise.all(Array.prototype.map.call(files, function (f) { return uploadTo('/api/projects/' + enc(pid) + '/upload', f); }))
            .then(function () { A.toast('Загружено'); P.project(pid); }).catch(fail);
        }, true);
      };
      body.querySelectorAll('[data-pf-del]').forEach(function (b) {
        b.onclick = function () {
          A.confirmAsk('Удалить файл «' + b.getAttribute('data-pf-del') + '» из проекта?', function (yes) {
            if (yes) A.post('/api/projects/' + enc(pid) + '/file-delete', { name: b.getAttribute('data-pf-del') }).then(function () { P.project(pid); }).catch(fail);
          });
        };
      });
      body.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { A.openChat(b.getAttribute('data-open')); }; });
      body.querySelector('#pc-ren').onclick = function () {
        ask('Название проекта', '', p.name, function (v) { save({ name: v }, 'Переименован').then(function () { A.loadChats(); P.project(pid); }); });
      };
      body.querySelector('#pc-desc').onclick = function () {
        ask('Описание проекта', 'Коротко, о чём проект', p.desc, function (v) { save({ desc: v }, 'Сохранено').then(function () { P.project(pid); }); });
      };
      body.querySelector('#pc-del').onclick = function () {
        A.confirmAsk('Удалить проект «' + p.name + '»? Чаты останутся, только выйдут из проекта. Файлы и память проекта 30 дней полежат в корзине на ноутбуке.', function (yes) {
          if (yes) A.post('/api/projects/' + enc(pid) + '/delete').then(function () { A.loadChats(); A.backPage(); A.toast('Проект удалён'); }).catch(fail);
        });
      };
    }).catch(fail);
  };
  function stripHead(t) { return String(t || '').replace(/^# (Правила|Память) проекта\n?/, ''); }

  // ---------- скиллы ----------
  var SKILL_TEMPLATE = '---\nname: \ndescription: \n---\n\n# Что делать\n1. \n2. \n';
  P.skills = function () {
    loading('Скиллы');
    A.api('/api/skills').then(function (r) {
      A.S.skills = r.skills || [];
      var body = A.page('Скиллы', '<div class="pg-h">Скиллы</div><p class="pg-sub">Готовые инструкции для типовых задач. Claude применяет их сам, ' +
        'когда задача подходит, или по команде «/имя» в начале сообщения. Создать скилл можно и прямо в чате: «давай создадим скилл…».</p>' +
        '<button type="button" class="btn" id="ns" style="width:100%;margin-bottom:14px">+ Новый скилл</button>' +
        '<div class="card">' + (A.S.skills.length ? A.S.skills.map(function (x) {
          return '<button type="button" class="row-btn" data-skill="' + esc(x.id) + '"><span class="t"><b>/' + esc(x.id) + '</b><small>' + esc(x.desc || x.name) + '</small></span></button>';
        }).join('') : '<div class="muted">Скиллов пока нет</div>') + '</div>');
      body.querySelector('#ns').onclick = function () { A.openPage('skill', ''); };
      body.querySelectorAll('[data-skill]').forEach(function (b) { b.onclick = function () { A.openPage('skill', b.getAttribute('data-skill')); }; });
    }).catch(fail);
  };
  P.skill = function (sid) {
    function show(x) {
      var body = A.page(sid ? '/' + sid : 'Новый скилл', '<p class="pg-sub">Вверху — имя и описание (по описанию Claude понимает, когда применять), ниже — сама инструкция.</p>' +
        '<textarea class="ta code" id="sk-text">' + esc(x.text) + '</textarea><div class="btn-row">' +
        '<button type="button" class="btn" id="sk-save">Сохранить</button>' + (sid ? '<button type="button" class="btn sec" id="sk-use">Применить в новом чате</button>' +
        '<button type="button" class="btn danger" id="sk-del">Удалить</button>' : '') + '</div>');
      body.querySelector('#sk-save').onclick = function () {
        A.post('/api/skills' + (sid ? '/' + enc(sid) : ''), { text: body.querySelector('#sk-text').value }).then(function (r) {
          A.S.skills = null; A.toast('Скилл сохранён'); A.backPage();
        }).catch(fail);
      };
      if (sid) {
        body.querySelector('#sk-use').onclick = function () {
          A.closePage(); A.newChat(); var i = document.getElementById('input'); i.value = '/' + sid + ' '; i.focus();
          i.dispatchEvent(new Event('input'));
        };
        body.querySelector('#sk-del').onclick = function () {
          A.confirmAsk('Удалить скилл /' + sid + '? Он 30 дней полежит в корзине на ноутбуке.', function (yes) {
            if (yes) A.post('/api/skills/' + enc(sid) + '/delete').then(function () { A.S.skills = null; A.backPage(); }).catch(fail);
          });
        };
      }
    }
    if (!sid) return show({ text: SKILL_TEMPLATE });
    loading('/' + sid);
    A.api('/api/skills/' + enc(sid)).then(show).catch(fail);
  };

  // ---------- память ----------
  P.memory = function () {
    loading('Память');
    A.api('/api/memory').then(function (r) {
      var body = A.page('Память', '<div class="pg-h">Память</div><p class="pg-sub">То, что Claude знает о тебе во всех чатах: учёба, интересы, ' +
        'как удобнее получать ответы. Claude дописывает сюда сам, когда ты рассказываешь о себе. Можно поправить вручную. ' +
        'В чатах-инкогнито память не используется.</p>' +
        '<textarea class="ta" id="mem" style="min-height:45vh">' + esc(r.text) + '</textarea>' +
        '<div class="btn-row"><button type="button" class="btn" id="mem-save">Сохранить</button></div>');
      body.querySelector('#mem-save').onclick = function () {
        A.post('/api/memory', { text: body.querySelector('#mem').value }).then(function () { A.toast('Память сохранена'); }).catch(fail);
      };
    }).catch(fail);
  };

  // ---------- файлы ----------
  function size(n) { return n < 1024 ? n + ' Б' : n < 1048576 ? Math.round(n / 1024) + ' КБ' : (n / 1048576).toFixed(1) + ' МБ'; }
  P.files = function () {
    loading('Файлы');
    A.api('/api/files').then(function (r) {
      var body = A.page('Файлы', '<div class="pg-h">Файлы</div><p class="pg-sub">Все файлы твоих чатов на ноутбуке — ' +
        'и те, что ты присылал, и те, что сделал Claude. Всего ' + size(r.total) + '.</p>' +
        (r.groups.length ? r.groups.map(function (g) {
          return '<div class="card"><h3><span class="grow">' + esc(g.title) + '</span><button type="button" class="btn sec" style="height:32px;padding:0 10px" data-open="' +
            esc(g.key) + '">Открыть чат</button></h3>' + g.files.map(function (f) {
              return '<button type="button" class="row-btn" data-fkey="' + esc(g.key) + '" data-fname="' + esc(f.name) + '"><span class="t">' +
                (/\.(png|jpe?g|gif|webp)$/i.test(f.name) ? '🖼 ' : '📎 ') + esc(f.name.replace(/^\d{4}_/, '')) +
                '<small>' + size(f.size) + ' · ' + new Date(f.time * 1000).toLocaleDateString('ru-RU') + '</small></span></button>';
            }).join('') + '</div>';
        }).join('') : '<div class="empty">Файлов пока нет</div>'));
      body.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { A.openChat(b.getAttribute('data-open')); }; });
      body.querySelectorAll('[data-fname]').forEach(function (b) {
        b.onclick = function () { fileMenu(b.getAttribute('data-fkey'), b.getAttribute('data-fname')); };
      });
    }).catch(fail);
  };
  // действия с файлом: посмотреть, скачать, прислать в Telegram
  function fileMenu(key, name) {
    var isImg = /\.(png|jpe?g|gif|webp)$/i.test(name);
    A.sheet(name.replace(/^\d{4}_/, ''), (isImg ? '<button type="button" class="sh-item" id="fm-view">' + A.I.photo + 'Посмотреть</button>' : '') +
      '<button type="button" class="sh-item" id="fm-dl">' + A.I.file + 'Скачать на устройство</button>' +
      '<button type="button" class="sh-item" id="fm-tg">' + A.I.move + 'Прислать в Telegram</button>');
    var path = '/api/chats/' + enc(key);
    if (isImg) document.getElementById('fm-view').onclick = function () {
      A.closeSheet();
      A.rawRetry(path + '/file?name=' + enc(name)).then(function (r) { return r.blob(); }).then(function (bl) {
        var v = document.getElementById('viewer'); v.querySelector('img').src = URL.createObjectURL(bl); v.hidden = false;
      }).catch(fail);
    };
    document.getElementById('fm-dl').onclick = function () {
      A.closeSheet();
      A.post(path + '/dl', { name: name }).then(function (r) {
        var url = A.apiBase() + '/dl/' + r.token + '/' + enc(r.name);
        var tg = window.Telegram && Telegram.WebApp;
        if (tg && tg.downloadFile) { try { tg.downloadFile({ url: url, file_name: r.name.replace(/^\d{4}_/, '') }); return; } catch (e) {} }
        if (tg && tg.openLink) tg.openLink(url); else window.open(url, '_blank');
      }).catch(fail);
    };
    document.getElementById('fm-tg').onclick = function () {
      A.closeSheet();
      A.post(path + '/to-telegram', { name: name }).then(function () { A.toast('Прислал в чат с ботом'); }).catch(fail);
    };
  }
  A.fileMenu = fileMenu;

  // ---------- лимиты ----------
  var LNAMES = { five_hour: '5 часов', seven_day: 'Неделя', seven_day_opus: 'Неделя · Opus', seven_day_sonnet: 'Неделя · Sonnet',
    seven_day_fable: 'Неделя · Fable', fable: 'Fable', five_hour_fable: '5 часов · Fable' };
  function lname(k) { return LNAMES[k] || (/fable/i.test(k) ? 'Fable · ' + k : k); }
  function when(ts) {
    if (!ts) return '';
    var t = ts > 1e12 ? ts : ts * 1000, d = new Date(t), now = Date.now();
    var mins = Math.round((t - now) / 60000);
    if (mins > 0 && mins < 600) return 'сбросится через ' + (mins >= 60 ? Math.floor(mins / 60) + ' ч ' : '') + (mins % 60) + ' мин';
    return 'сбросится ' + d.toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function tokens(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + ' млн' : n >= 1e3 ? Math.round(n / 1e3) + ' тыс.' : String(n); }
  // ---------- проверка связи: какие объёмы проходят от телефона до ноутбука и обратно ----------
  P.net = function () {
    var sizes = [8, 32, 128, 512, 2048];   // КБ
    var body = A.page('Проверка связи', '<div class="pg-h">Проверка связи</div><p class="pg-sub">Гоняю данные разного объёма между телефоном и ноутбуком. ' +
      'Так видно, на каком объёме дорога «встаёт».</p><div class="card" id="net-out" style="font-variant-numeric:tabular-nums"></div>' +
      '<button type="button" class="btn" id="net-go" style="margin-top:12px">Проверить ещё раз</button>');
    var out = body.querySelector('#net-out'), res = [];
    function line(t) { out.insertAdjacentHTML('beforeend', '<div style="padding:5px 0;border-bottom:1px solid var(--line)">' + esc(t) + '</div>'); }
    function xhr(method, path, data, kb) {
      return new Promise(function (ok) {
        var x = new XMLHttpRequest(), t0 = Date.now(), sent = 0, got = 0, done = false;
        function fin(r) { if (done) return; done = true; clearTimeout(tm); r.ms = Date.now() - t0; r.kb = kb; r.sent = sent; r.got = got; ok(r); }
        x.open(method, A.apiUrl(path));
        x.setRequestHeader('X-Init-Data', A.initData()); x.setRequestHeader('X-Pinggy-No-Screen', '1');
        if (data) x.setRequestHeader('Content-Type', 'application/octet-stream');
        x.responseType = 'arraybuffer';
        if (x.upload) x.upload.onprogress = function (e) { if (e.lengthComputable) sent = Math.round(e.loaded / e.total * 100); };
        x.onprogress = function (e) { got = e.loaded; };
        x.onload = function () { fin({ ok: x.status === 200, st: x.status, bytes: x.response ? x.response.byteLength : 0 }); };
        x.onerror = function () { fin({ ok: false, st: 'сеть' }); };
        var tm = setTimeout(function () { x.abort(); fin({ ok: false, st: 'встало' }); }, 25000);
        x.send(data || null);
      });
    }
    function run() {
      out.innerHTML = ''; res = []; var q = Promise.resolve();
      sizes.forEach(function (kb) {
        q = q.then(function () { return xhr('GET', '/api/diag/down?n=' + kb * 1024, null, kb); }).then(function (r) {
          r.dir = 'down'; res.push(r);
          line('⬇ к телефону ' + kb + ' КБ — ' + (r.ok && r.bytes === kb * 1024 ? 'ок, ' + (r.ms / 1000).toFixed(1) + ' с' : 'НЕ ДОШЛО (' + r.st + ', получено ' + Math.round(r.got / 1024) + ' КБ)'));
        });
      });
      sizes.forEach(function (kb) {
        q = q.then(function () { return xhr('POST', '/api/diag/up', new Uint8Array(kb * 1024), kb); }).then(function (r) {
          r.dir = 'up'; res.push(r);
          line('⬆ к ноутбуку ' + kb + ' КБ — ' + (r.ok ? 'ок, ' + (r.ms / 1000).toFixed(1) + ' с' : 'НЕ ДОШЛО (' + r.st + ', ушло с телефона ' + r.sent + '%)'));
        });
      });
      q.then(function () {
        line('Готово. Результат записан на ноутбуке.');
        A.post('/api/diag/report', { ua: navigator.userAgent.slice(0, 120), res: res.map(function (r) { return [r.dir, r.kb, r.ok ? 'ok' : r.st, r.ms, r.sent, Math.round(r.got / 1024)]; }) }).catch(function () {});
      });
    }
    body.querySelector('#net-go').onclick = run;
    run();
  };

  P.limits = function () {
    loading('Лимиты');
    A.api('/api/limits').then(function (r) {
      var keys = Object.keys(r.limits || {}).sort(function (a, b) { return (/fable/i.test(a) ? 1 : 0) - (/fable/i.test(b) ? 1 : 0); });
      var lim = keys.map(function (k) {
        var x = r.limits[k].info || {};
        var u = x.utilization != null ? x.utilization : x.used_percentage != null ? x.used_percentage / 100 : null;
        var pct = u == null ? null : Math.round(u * (u <= 1 ? 100 : 1));
        var st = x.status === 'rejected' ? ' · исчерпан' : x.status === 'allowed_warning' ? ' · скоро кончится' : '';
        return '<div class="card"><h3>' + esc(lname(k)) + st + '</h3>' + (pct != null ? '<div class="meter' + (/fable/i.test(k) ? ' violet' : '') +
          '"><i style="width:' + Math.min(100, pct) + '%"></i></div><div class="kv"><span>использовано ' + pct + '%</span><span>' + esc(when(x.resetsAt || x.resets_at)) + '</span></div>'
          : '<div class="kv"><span>' + esc(x.status || 'есть данные') + '</span><span>' + esc(when(x.resetsAt || x.resets_at)) + '</span></div>') +
          '<div class="muted" style="margin-top:6px;font-size:12.5px">обновлено ' + new Date(r.limits[k].seen * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</div></div>';
      }).join('');
      function usageRows(o) {
        var ks = Object.keys(o || {}); if (!ks.length) return '<div class="muted">Пока пусто</div>';
        return ks.map(function (k) {
          return '<div class="kv" style="padding:4px 0"><span>' + esc(k.charAt(0).toUpperCase() + k.slice(1)) + ' · ответов: ' + o[k].n +
            '</span><span>' + tokens(o[k]['in'] + o[k].out) + ' токенов</span></div>';
        }).join('');
      }
      var hasFable = r.owner;
      var fableToday = (r.today && r.today.fable) || null, fableWeek = (r.week && r.week.fable) || null;
      A.page('Лимиты', '<div class="pg-h">Лимиты</div><p class="pg-sub">Лимиты подписки Claude на ноутбуке. Claude Code сообщает их при ответах — ' +
        'цифры обновляются после каждого сообщения.</p>' +
        (lim || '<div class="card"><h3>Лимиты подписки</h3><div class="muted">Claude Code ещё не прислал данных о лимитах. Они появятся после ' +
          'ближайших ответов (если твоя версия Claude Code их сообщает). Ниже — свой учёт.</div></div>') +
        (hasFable ? '<div class="card"><h3>Fable — отдельный лимит</h3>' +
          (keys.some(function (k) { return /fable/i.test(k); }) ? '<div class="muted">Смотри строку Fable выше.</div>' :
            '<div class="muted">Своих данных о лимите Fable Claude Code не прислал. Свой учёт:</div>') +
          '<div class="kv" style="padding:6px 0 0"><span>Сегодня</span><span>' + (fableToday ? fableToday.n + ' отв. · ' + tokens(fableToday['in'] + fableToday.out) + ' ток.' : '0') + '</span></div>' +
          '<div class="kv"><span>За 7 дней</span><span>' + (fableWeek ? fableWeek.n + ' отв. · ' + tokens(fableWeek['in'] + fableWeek.out) + ' ток.' : '0') + '</span></div></div>' : '') +
        '<div class="card"><h3>Мои сообщения</h3><div class="kv"><span>Сегодня</span><span>' + r.messages.today +
        (r.messages.limit ? ' из ' + r.messages.limit : '') + '</span></div><div class="kv"><span>За 7 дней</span><span>' + r.messages.week + '</span></div></div>' +
        '<div class="card"><h3>Расход по моделям · сегодня</h3>' + usageRows(r.today) + '</div>' +
        '<div class="card"><h3>Расход по моделям · 7 дней</h3>' + usageRows(r.week) + '</div>');
    }).catch(fail);
  };

  // ---------- аккаунты (только владелец) ----------
  var STATUS = { ok: '✅ доступ', pending: '📥 ждёт решения', paused: '⏸ заморожен', blocked: '⛔ закрыт' };
  P.accounts = function () {
    loading('Аккаунты');
    A.api('/api/accounts').then(function (r) {
      var body = A.page('Аккаунты', '<div class="pg-h">Аккаунты</div><p class="pg-sub">Кто пользуется ботом. Новые аккаунты попадают сюда ' +
        'и ждут твоего решения. Fable доступна только тебе.</p>' + r.accounts.map(function (a) {
          return '<button type="button" class="pcard" data-acc="' + a.uid + '"><span class="sq" style="background:' + (a.owner ? '#8E7FE8' : '#5E5D59') +
            ';color:#fff;font-weight:700">' + esc((a.name || '?').charAt(0)) + '</span><span class="t"><b>' + esc(a.name) + (a.owner ? ' · ты' : '') +
            '</b><small>' + esc(STATUS[a.status] || a.status) + ' · сегодня ' + a.today + (a.limit ? ' из ' + a.limit : '') + ' · чатов ' + a.chats +
            (a.username ? ' · @' + esc(a.username) : '') + '</small></span></button>';
        }).join(''));
      body.querySelectorAll('[data-acc]').forEach(function (b) {
        b.onclick = function () { A.openPage('account', r.accounts.filter(function (a) { return String(a.uid) === b.getAttribute('data-acc'); })[0]); };
      });
    }).catch(fail);
  };
  P.account = function (a) {
    if (!a) return A.backPage();
    loading(a.name);
    A.api('/api/accounts/' + a.uid + '/chats').then(function (r) {
      var lims = [null, 20, 50, 100, 200];
      var body = A.page(a.name, '<div class="pg-h">' + esc(a.name) + '</div><p class="pg-sub">' + esc(STATUS[a.status] || a.status) +
        ' · сегодня ' + a.today + ' · за неделю ' + a.week + (a.username ? ' · @' + esc(a.username) : '') + ' · ID ' + a.uid + '</p>' +
        (a.owner ? '' : '<div class="card"><h3>Доступ</h3><div class="btn-row">' +
          '<button type="button" class="btn' + (a.status === 'ok' ? '' : ' sec') + '" data-st="ok">Открыть</button>' +
          '<button type="button" class="btn' + (a.status === 'paused' ? '' : ' sec') + '" data-st="paused">Заморозить</button>' +
          '<button type="button" class="btn danger" data-st="blocked">Закрыть</button></div></div>' +
          '<div class="card"><h3>Лимит сообщений в день</h3><div class="seg">' + lims.map(function (l) {
            return '<button type="button" data-lim="' + (l || '') + '"' + (l === (a.limit || null) ? ' class="on"' : '') + '>' + (l || 'без') + '</button>';
          }).join('') + '</div></div>') +
        '<div class="card"><h3>Чаты</h3>' + (r.chats.length ? r.chats.map(function (c) {
          return '<button type="button" class="row-btn" data-hist="' + esc(c.key) + '"><span class="t">' + esc(c.title) + '<small>' + c.n + ' сообщений</small></span></button>';
        }).join('') : '<div class="muted">Чатов нет</div>') + '</div>');
      function set(patch, msg) {
        A.post('/api/accounts/' + a.uid, patch).then(function () { Object.assign(a, patch); A.toast(msg); P.account(a); }).catch(fail);
      }
      body.querySelectorAll('[data-st]').forEach(function (b) { b.onclick = function () { set({ status: b.getAttribute('data-st') }, 'Готово'); }; });
      body.querySelectorAll('[data-lim]').forEach(function (b) {
        b.onclick = function () { var v = b.getAttribute('data-lim'); set({ limit: v ? +v : null }, 'Лимит: ' + (v || 'без лимита')); };
      });
      body.querySelectorAll('[data-hist]').forEach(function (b) { b.onclick = function () { A.openPage('history', b.getAttribute('data-hist')); }; });
    }).catch(fail);
  };
  P.history = function (key) {
    loading('История');
    A.api('/api/history/' + enc(key)).then(function (r) {
      A.page(r.title, '<p class="pg-sub">Только просмотр</p>' + (r.messages.length ? r.messages.map(function (m) {
        return '<div class="card"><h3>' + (m.role === 'user' ? 'Пользователь' : 'Claude') + '<span class="grow"></span><span class="muted">' + esc(m.time) +
          '</span></h3><div class="md" style="font-size:15.5px">' + A.md.render(m.text).html + '</div></div>';
      }).join('') : '<div class="empty">Пусто</div>'));
    }).catch(fail);
  };
})();
