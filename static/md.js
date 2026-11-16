// Небольшой разбор Markdown для ответов Claude: заголовки, списки, таблицы, цитаты, код, ссылки.
// Блоки ```svg / ```html / ```smiles не показываются как код — вместо них место под рисунок (data-w).
var MD = (function () {
  'use strict';
  var WIDGETS = { svg: 'svg', html: 'html', smiles: 'smiles', chem: 'smiles' };
  var LI = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // формулы LaTeX: $…$, \(…\) — в строке; $$…$$, \[…\] — отдельным блоком
  function tex(src, display) {
    if (!window.katex) return esc(display ? '$$' + src + '$$' : '$' + src + '$');
    try { return katex.renderToString(src, { displayMode: !!display, throwOnError: false, strict: 'ignore', output: 'html' }); }
    catch (e) { return esc(src); }
  }
  function inline(s) {
    var codes = [], maths = [];
    s = String(s).replace(/`([^`\n]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\\\((.+?)\\\)/g, function (_, m) { maths.push(tex(m)); return '\u0001' + (maths.length - 1) + '\u0001'; });
    s = s.replace(/\$\$(.+?)\$\$/g, function (_, m) { maths.push(tex(m, true)); return '\u0001' + (maths.length - 1) + '\u0001'; });
    s = s.replace(/(^|[^\\$\w])\$(?=[^\s$])([^$\n]*?[^\s$\\])\$(?![\w$])/g, function (all, pre, m) {
      if (/^\d+([.,]\d+)?$/.test(m)) return all;          // «$5» — это деньги, а не формула
      maths.push(tex(m)); return pre + '\u0001' + (maths.length - 1) + '\u0001';
    });
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" data-ext>$1</a>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)"]+[^\s<)".,;:!?])/g, '$1<a href="$2" data-ext>$2</a>');
    s = s.replace(/\*\*(?=\S)([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/__(?=\S)([\s\S]+?)__/g, '<b>$1</b>');
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)\*(?!\*)/g, '$1<i>$2</i>');
    s = s.replace(/(^|[^\w])_(?=\S)([^_\n]+?)_(?=[^\w]|$)/g, '$1<i>$2</i>');
    s = s.replace(/~~(?=\S)(.+?)~~/g, '<s>$1</s>');
    s = s.replace(/^\[ \]\s/, '☐ ').replace(/^\[[xX]\]\s/, '☑ ');
    s = s.replace(/\u0001(\d+)\u0001/g, function (_, i) { return maths[+i]; });
    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + esc(codes[+i]) + '</code>'; });
  }

  function indentOf(l) { return l.match(/^\s*/)[0].replace(/\t/g, '    ').length; }
  function isFence(l) { return /^\s*```/.test(l); }
  function isTableRow(l) { return /^\s*\|.*\|\s*$/.test(l); }
  function isBlockStart(l) {
    return isFence(l) || /^#{1,6}\s/.test(l) || /^\s*>/.test(l) || LI.test(l) || isTableRow(l) ||
      /^\s*(---|\*\*\*|___)\s*$/.test(l);
  }

  function parseList(lines, i, base) {
    var first = lines[i].match(LI);
    var ordered = /\d/.test(first[2]);
    var start = ordered ? parseInt(first[2], 10) : 1;
    var html = ordered ? '<ol' + (start !== 1 ? ' start="' + start + '"' : '') + '>' : '<ul>';
    var open = false;
    while (i < lines.length) {
      var l = lines[i], m = l.match(LI);
      if (!m) {
        if (/^\s*$/.test(l)) {
          var n = lines[i + 1];
          if (n !== undefined && LI.test(n) && indentOf(n) >= base) { i++; continue; }
          if (n !== undefined && open && indentOf(n) > base && !LI.test(n) && !/^\s*$/.test(n)) { i++; continue; }
          break;
        }
        if (open && indentOf(l) > base) { html += '<br>' + inline(l.trim()); i++; continue; }
        break;
      }
      var ind = indentOf(l);
      if (ind < base) break;
      if (ind <= base + 1 && /\d/.test(m[2]) !== ordered) break;   // нумерованный и обычный список — разные списки
      if (ind > base + 1 && open) {
        var r = parseList(lines, i, ind);
        html += r.html; i = r.i; continue;
      }
      if (open) html += '</li>';
      html += '<li>' + inline(m[3]); open = true; i++;
    }
    if (open) html += '</li>';
    html += ordered ? '</ol>' : '</ul>';
    return { html: html, i: i };
  }

  function cells(row) {
    return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function render(src, blocks) {
    blocks = blocks || [];
    var lines = String(src || '').replace(/\r/g, '').split('\n');
    var out = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      var fm = l.match(/^\s*```\s*([\w+#.-]*)/);
      if (fm) {
        var lang = (fm[1] || '').toLowerCase(), buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        var closed = i < lines.length;
        i++;
        var code = buf.join('\n');
        if (WIDGETS[lang]) {
          blocks.push({ kind: WIDGETS[lang], code: code, closed: closed });
          out.push('<div class="widget" data-w="' + (blocks.length - 1) + '"></div>');
        } else {
          out.push('<div class="code"><div class="code-h"><span>' + esc(lang || 'код') +
            '</span><button type="button" data-copy>Копировать</button></div><pre><code>' + esc(code) + '</code></pre></div>');
        }
        continue;
      }
      if (/^\s*$/.test(l)) { i++; continue; }
      var dm = l.match(/^\s*(\$\$|\\\[)\s*(.*)$/);
      if (dm) {                                   // формула отдельным блоком, может быть на нескольких строках
        var close = dm[1] === '$$' ? '$$' : '\\]', body = [], rest = dm[2];
        var endAt = rest.indexOf(close);
        if (endAt >= 0) { body.push(rest.slice(0, endAt)); i++; }
        else {
          body.push(rest); i++;
          while (i < lines.length && lines[i].indexOf(close) < 0) { body.push(lines[i]); i++; }
          if (i < lines.length) { body.push(lines[i].slice(0, lines[i].indexOf(close))); i++; }
        }
        out.push('<div class="mathblock">' + tex(body.join('\n'), true) + '</div>');
        continue;
      }
      var h = l.match(/^(#{1,6})\s+(.*)$/);
      if (h) { var n = Math.min(h[1].length + 1, 4); out.push('<h' + n + '>' + inline(h[2]) + '</h' + n + '>'); i++; continue; }
      if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(l)) {
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + render(q.join('\n'), blocks) + '</blockquote>');
        continue;
      }
      if (isTableRow(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        var head = cells(l), rows = [];
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push('<div class="tbl"><table><thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
          '</tr></thead><tbody>' + rows.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
        continue;
      }
      if (LI.test(l)) { var r = parseList(lines, i, indentOf(l)); out.push(r.html); i = r.i; continue; }
      var p = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && (p.length === 0 || !isBlockStart(lines[i]))) { p.push(lines[i]); i++; }
      out.push('<p>' + p.map(inline).join('<br>') + '</p>');
    }
    return out.join('');
  }

  return {
    esc: esc,
    render: function (src) { var blocks = []; var html = render(src, blocks); return { html: html, blocks: blocks }; }
  };
})();
