/**
 * Site-agnostic staging admin engine.
 *
 * Site-specific config lives in admin-fields.js (loaded first) and exposes:
 *   window.ADMIN_CONFIG        — repo, deploy workflow, and (multi-page) pages list
 *   window.ADMIN_FIELDS        — field map. Flat for single-page sites, or
 *                                 keyed by page id for multi-page sites.
 *   window.ADMIN_SECTION_ORDER — optional explicit markdown serialisation order.
 *                                 In multi-page mode may be keyed by page id.
 *
 * Single-page sites set ADMIN_CONFIG.contentPath/siteIndexUrl. Multi-page sites
 * set ADMIN_CONFIG.pages = [{id, label, contentPath, siteUrl}, …] and shape
 * ADMIN_FIELDS as { pageId: { fieldKey: {…} } }.
 *
 * The engine handles loading, rendering, live preview, dirty state, the GitHub
 * publish flow, and dispatching pencil clicks to a popup editor. It contains
 * no site-specific selectors, field names, render rules, or layout HTML —
 * everything specific lives in admin-fields.js.
 */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────

  var CFG       = window.ADMIN_CONFIG        || {};
  var ALL_FIELDS = window.ADMIN_FIELDS        || {};
  var ALL_ORDER  = window.ADMIN_SECTION_ORDER || null;

  var GITHUB_REPO   = CFG.githubRepo     || '';
  var GITHUB_BRANCH = CFG.githubBranch   || 'main';
  var DEPLOY_WF     = CFG.deployWorkflow || 'deploy-staging.yml';
  var DEPLOY_TARGET = CFG.deployTarget   || 'staging';

  // Pages: either explicit (multi-page) or a synthetic single entry (legacy).
  var IS_MULTIPAGE = Array.isArray(CFG.pages) && CFG.pages.length > 0;
  var PAGES = IS_MULTIPAGE ? CFG.pages.slice() : [{
    id:          '_default',
    label:       '',
    contentPath: CFG.contentPath  || '',
    siteUrl:     CFG.siteIndexUrl || '/index.html',
  }];

  var DEPLOY_API = 'https://api.github.com/repos/' + GITHUB_REPO + '/actions/workflows/' + DEPLOY_WF + '/dispatches';
  var TOKEN_KEY  = 'admin_github_token';

  function contentApi(pageId) {
    var p = PAGES.find(function (x) { return x.id === pageId; });
    return 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + (p ? p.contentPath : '');
  }
  function pageSiteUrl(pageId) {
    var p = PAGES.find(function (x) { return x.id === pageId; });
    return p ? p.siteUrl : '/index.html';
  }

  // ── Per-page state ────────────────────────────────────────────────────────
  //
  // pageState caches loaded markdown, sha, iframe HTML, draft, and scroll
  // position for every page the user has visited. The top-level variables
  // (originalMd, fileSha, draft, etc.) are a snapshot of the *active* page;
  // they get swapped in/out on page switch. Most engine code keeps using
  // them as before.

  var pageState = {};
  function getPageState(id) {
    if (!pageState[id]) {
      pageState[id] = {
        originalMd:    '',
        fileSha:       '',
        iframeSrcHtml: '',
        draft:         {},
        scroll:        0,
        loaded:        false,
      };
    }
    return pageState[id];
  }

  var activePage = PAGES[0].id;

  // Derived: which field map / item-owner index / order applies to active page.
  function computeActiveFields() {
    if (!IS_MULTIPAGE) return ALL_FIELDS;
    return (ALL_FIELDS && ALL_FIELDS[activePage]) || {};
  }
  function computeItemOwners(fields) {
    var idx = {};
    Object.keys(fields).forEach(function (k) {
      var f = fields[k];
      if (f && f.type === 'list' && Array.isArray(f.itemKeys)) {
        f.itemKeys.forEach(function (ik) { idx[ik] = { listKey: k, field: f }; });
      }
    });
    return idx;
  }
  function computeActiveOrder() {
    if (!IS_MULTIPAGE) return Array.isArray(ALL_ORDER) ? ALL_ORDER : null;
    if (ALL_ORDER && typeof ALL_ORDER === 'object' && !Array.isArray(ALL_ORDER)
        && Array.isArray(ALL_ORDER[activePage])) {
      return ALL_ORDER[activePage];
    }
    return null;
  }

  // Active-page snapshots (swapped on page switch via swapState).
  var FIELDS     = computeActiveFields();
  var ITEM_OWNER = computeItemOwners(FIELDS);
  var ORDER      = computeActiveOrder();

  var originalMd    = '';
  var fileSha       = '';
  var iframeSrcHtml = '';
  var draft         = {};        // { section: { sub_or_itemKey: rawValue } }
  var iframeScroll  = 0;
  var activeKey     = null;      // field/item key whose popup is open
  var popupPrev     = null;      // raw value before popup opened (for cancel)
  var pencilsOn     = true;
  var _afterToken   = null;

  function syncActiveToPageState() {
    var ps = getPageState(activePage);
    ps.originalMd    = originalMd;
    ps.fileSha       = fileSha;
    ps.iframeSrcHtml = iframeSrcHtml;
    ps.draft         = draft;
    ps.scroll        = iframeScroll;
    ps.loaded        = !!originalMd;
  }

  function loadActiveFromPageState() {
    var ps = getPageState(activePage);
    originalMd    = ps.originalMd;
    fileSha       = ps.fileSha;
    iframeSrcHtml = ps.iframeSrcHtml;
    draft         = ps.draft;
    iframeScroll  = ps.scroll;
    FIELDS        = computeActiveFields();
    ITEM_OWNER    = computeItemOwners(FIELDS);
    ORDER         = computeActiveOrder();
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────

  var frame        = document.getElementById('adm-frame');
  var frameOver    = document.getElementById('adm-frame-overlay');
  var dirtyMsg     = document.getElementById('adm-dirty-msg');
  var statusEl     = document.getElementById('adm-status');
  var publishBtn   = document.getElementById('adm-publish');
  var pencilToggle = document.getElementById('adm-pencils-toggle');
  var popup        = document.getElementById('adm-popup');
  var popupLabel   = document.getElementById('adm-popup-label');
  var popupBody    = document.getElementById('adm-popup-body');
  var popupHint    = document.getElementById('adm-popup-hint');
  var popupConfirm = document.getElementById('adm-popup-confirm');
  var popupCancel  = document.getElementById('adm-popup-cancel');
  var tokenDialog  = document.getElementById('token-dialog');
  var tokenForm    = document.getElementById('token-form');
  var tokenInput   = document.getElementById('token-input');
  var tokenError   = document.getElementById('token-error');
  var tokenCancel  = document.getElementById('token-cancel-btn');

  // ── Utilities ─────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function attr(s) { return esc(s); }

  function mdInline(text) {
    if (text == null) return '';
    var t = String(text).trim();
    if (!t) return '';
    if (window.marked) {
      var h = window.marked.parse(t);
      return h.replace(/^<p>/, '').replace(/<\/p>\s*$/, '');
    }
    return t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,     '<em>$1</em>');
  }

  function parseContent(text) {
    var out  = {};
    var body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    var sp   = body.split(/^## +/m);
    for (var i = 1; i < sp.length; i++) {
      var ls   = sp[i].split('\n');
      var sec  = ls[0].trim().toLowerCase();
      var rest = ls.slice(1).join('\n');
      out[sec] = {};
      var sub  = rest.split(/^### +/m);
      for (var j = 1; j < sub.length; j++) {
        var sl = sub[j].split('\n');
        out[sec][sl[0].trim().toLowerCase()] = sl.slice(1).join('\n').trim();
      }
    }
    return out;
  }

  function getFrontmatter(text) {
    var m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    return m ? m[0] : '';
  }

  function getToken()   { return sessionStorage.getItem(TOKEN_KEY) || ''; }
  function saveToken(t) { sessionStorage.setItem(TOKEN_KEY, t.trim()); }
  function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className   = 'adm-status' + (cls ? ' ' + cls : '');
  }
  function clearStatus(ms) { setTimeout(function () { setStatus(''); }, ms || 2500); }

  function loadMarked(cb) {
    if (window.marked) { cb(); return; }
    var s = document.createElement('script');
    s.src     = 'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js';
    s.onload  = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  // ── Field rendering (single source of truth) ──────────────────────────────
  //
  // Turns a raw markdown value into HTML for the live preview / build-time
  // injection step. `render: 'md'` (default) → inline markdown.
  //   `render: 'escape'` → plain-text escape.
  //   `render: 'lines'`  → split lines, escape, wrap each in <div>.
  // `wrap(html)` is an optional site-specific post-transform.

  function renderField(key, raw) {
    var f = FIELDS[key];
    if (!f || raw == null) return '';
    var html;
    var r = f.render || 'md';
    if (r === 'escape') {
      html = esc(raw);
    } else if (r === 'lines') {
      html = String(raw).split('\n')
        .filter(function (l) { return l.trim(); })
        .map(function (l) { return '<div>' + esc(l) + '</div>'; })
        .join('\n');
    } else {
      html = mdInline(raw);
    }
    if (typeof f.wrap === 'function') html = f.wrap(html);
    return html;
  }

  // ── List-field bookkeeping ────────────────────────────────────────────────
  // Reverse index ITEM_OWNER (itemKey → { listKey, field }) is recomputed on
  // page switch by computeItemOwners() above.

  function getListOwner(key) { return ITEM_OWNER[key] || null; }

  function listRenderHelpers() {
    return {
      esc:         esc,
      attr:        attr,
      mdInline:    mdInline,
      renderField: renderField,
      pencilBtn:   function (key) { return pencilBtn(key); },
    };
  }

  // ── Draft helpers ─────────────────────────────────────────────────────────

  function setDraftValue(section, key, value) {
    if (!draft[section]) draft[section] = {};
    draft[section][key] = value;
  }

  function getCurrentValueRaw(section, key) {
    if (draft[section] && draft[section][key] != null) return draft[section][key];
    var secs = parseContent(originalMd);
    return (secs[section] || {})[key] || '';
  }

  function countDirty() {
    var n = 0;
    for (var k in draft) { if (Object.keys(draft[k]).length > 0) n++; }
    return n;
  }

  function isPopupUnsaved() {
    if (!activeKey) return false;
    var owner = getListOwner(activeKey);
    if (owner) {
      var current = readItemFromPopup(owner.field);
      var raw = owner.field.serializeItem ? owner.field.serializeItem(current) : '';
      return raw !== popupPrev;
    }
    var inp = document.getElementById('adm-popup-input');
    return !!inp && inp.value !== (popupPrev || '');
  }

  function updateDirty() {
    var committed = countDirty() > 0;
    publishBtn.disabled = !(committed || isPopupUnsaved());
    dirtyMsg.hidden = !committed;
  }

  function isDirty(key) {
    var owner = getListOwner(key);
    if (owner) {
      var sec = owner.field.section;
      return !!(draft[sec] && draft[sec][key] != null);
    }
    var f = FIELDS[key];
    if (!f) return false;
    return !!(draft[f.section] && draft[f.section][f.sub] != null);
  }

  // ── Markdown serialiser ───────────────────────────────────────────────────
  //
  // Order is derived from FIELDS declaration order unless ADMIN_SECTION_ORDER
  // is explicitly provided.

  function deriveOrder() {
    if (Array.isArray(ORDER)) return ORDER;
    var sections = [];
    var byId = {};
    Object.keys(FIELDS).forEach(function (k) {
      var f = FIELDS[k];
      var sec = f.section;
      if (!sec) return;
      if (!byId[sec]) {
        byId[sec] = { id: sec, keys: [] };
        sections.push(byId[sec]);
      }
      var keys = (f.type === 'list' && Array.isArray(f.itemKeys))
        ? f.itemKeys
        : (f.sub ? [f.sub] : []);
      keys.forEach(function (kk) {
        if (byId[sec].keys.indexOf(kk) === -1) byId[sec].keys.push(kk);
      });
    });
    return sections;
  }

  function buildMarkdown() {
    var secs = parseContent(originalMd);
    for (var sid in draft) {
      if (!secs[sid]) secs[sid] = {};
      for (var k in draft[sid]) secs[sid][k] = draft[sid][k];
    }
    var fm    = getFrontmatter(originalMd).trimEnd();
    var parts = [fm];
    deriveOrder().forEach(function (s) {
      var sec = secs[s.id];
      if (!sec) return;
      parts.push('\n## ' + s.id);
      s.keys.forEach(function (k) {
        var v = sec[k];
        if (v == null) return;
        parts.push('\n### ' + k);
        parts.push(v);
      });
    });
    return parts.join('\n') + '\n';
  }

  // ── QC marker injection ───────────────────────────────────────────────────

  function injectQC(html, key, inner) {
    return html.replace(
      new RegExp('(<!-- QC:' + key + ' -->)[\\s\\S]*?(<!-- /QC:' + key + ' -->)', 'g'),
      function (m, open, close) { return open + inner + close; }
    );
  }

  function applyDraft(html, secs) {
    var helpers = listRenderHelpers();
    // Pass 1: simple fields (input/textarea)
    Object.keys(FIELDS).forEach(function (k) {
      var f = FIELDS[k];
      if (f.type === 'list') return;
      var raw = (secs[f.section] || {})[f.sub];
      if (raw == null || raw === '') return;
      var rendered = renderField(k, raw);
      if (rendered) html = injectQC(html, k, rendered);
    });
    // Pass 2: list fields
    Object.keys(FIELDS).forEach(function (k) {
      var f = FIELDS[k];
      if (f.type !== 'list' || typeof f.renderList !== 'function') return;
      var rendered = f.renderList(secs[f.section] || {}, helpers);
      if (rendered) html = injectQC(html, k, rendered);
    });
    return html;
  }

  // ── Pencil injection ──────────────────────────────────────────────────────

  var PENCIL_SVG =
    '<svg width="11" height="11" viewBox="0 0 32 32" fill="none" ' +
    'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M22 4l6 6L10 28H4v-6L22 4z"/></svg>';

  // Editor-only styles, injected into the preview iframe <head>. Generic
  // (pencil button, dirty outline, block external nav/forms) — no site CSS.
  var IFRAME_STYLE = (
    '.qc-pencil{display:inline-flex;align-items:center;justify-content:center;' +
    'width:17px;height:17px;margin-left:5px;padding:0;' +
    'background:rgba(85,102,85,0.65);color:#fff;border:none;border-radius:3px;' +
    'cursor:pointer;opacity:0.55;vertical-align:middle;' +
    'pointer-events:auto!important;' +
    'transition:opacity .18s,background .18s;flex-shrink:0;}' +
    '.qc-pencil.qc-pencil-block{display:block;margin:6px 0 0;}' +
    '.qc-pencil:hover{opacity:1!important;background:rgba(85,102,85,0.95);}' +
    '.qc-pencil.is-dirty{opacity:0.8;outline:2px solid rgba(90,138,90,.55);outline-offset:2px;}' +
    '*:hover>.qc-pencil{opacity:0.8;}' +
    'body.no-pencils .qc-pencil{display:none!important;}' +
    'a[target="_blank"]{pointer-events:none!important;}' +
    'form{pointer-events:none!important;}' +
    // Fixed/sticky page headers overlay content; make them click-through so
    // pencils on content beneath the header remain reachable. Pencils inside
    // the header still work because .qc-pencil has pointer-events:auto.
    'header{pointer-events:none!important;}'
  );

  // Site-agnostic iframe script: forwards pencil clicks to the parent, toggles
  // pencil visibility, and runs the default qcText replacement. Anything more
  // specific is handled by parent-context liveUpdate callbacks via direct DOM
  // access — the iframe never executes config-supplied code.
  var IFRAME_SCRIPT = (
    '<script>(function(){' +
    'window.qcEdit=function(key,btn){' +
    'var r=btn.getBoundingClientRect();' +
    'window.parent.postMessage({type:"qc-edit",key:key,rect:{x:r.left,y:r.top,w:r.width,h:r.height}},"*");' +
    '};' +
    // Forward any non-pencil click in the iframe to the parent so it can
    // cancel an open popup. Pencil clicks already send their own qc-edit.
    'document.addEventListener("click",function(e){' +
    'if(e.target&&e.target.closest&&e.target.closest(".qc-pencil"))return;' +
    'window.parent.postMessage({type:"qc-iframe-click"},"*");' +
    '},true);' +
    'window.addEventListener("message",function(e){' +
    'if(!e.data)return;' +
    'var t=e.data.type,key=e.data.key;' +
    'if(t==="qc-pencils"){document.body.classList.toggle("no-pencils",!e.data.on);return;}' +
    'if(t==="qc-pencil-dirty"){' +
    'document.querySelectorAll(".qc-pencil[data-qc-key=\\""+key+"\\"]").forEach(function(p){p.classList.toggle("is-dirty",!!e.data.dirty);});' +
    'return;}' +
    'if(t!=="qc-live")return;' +
    'document.querySelectorAll("span.qc-text[data-qc-key=\\""+key+"\\"]").forEach(function(s){s.innerHTML=e.data.html||"";});' +
    '});' +
    '})();<' + '/script>'
  );

  function pencilLabel(key) {
    var owner = getListOwner(key);
    if (owner) return owner.field.label + ' — ' + key;
    var f = FIELDS[key] || {};
    return f.label || key;
  }

  function pencilBtn(key, blockClass) {
    var cls = 'qc-pencil' + (blockClass ? ' ' + blockClass : '') + (isDirty(key) ? ' is-dirty' : '');
    return '<button class="' + cls + '" data-qc-key="' + key + '" ' +
      'aria-label="Edit ' + esc(pencilLabel(key)) + '" ' +
      'onclick="event.preventDefault();event.stopPropagation();qcEdit(\'' + key + '\',this)">' +
      PENCIL_SVG + '</button>';
  }

  function injectFieldPencils(html) {
    html = html.replace('</head>', '<style>' + IFRAME_STYLE + '</style>\n</head>');
    html = html.replace('</body>', IFRAME_SCRIPT + '\n</body>');

    Object.keys(FIELDS).forEach(function (key) {
      var f = FIELDS[key];
      if (f.type === 'list') return;  // list pencils are emitted by renderList
      if (f.pencilStyle === 'block') {
        // Block-style: pencil appears after the closing marker, no qc-text wrap.
        var re = new RegExp('(<!-- \\/QC:' + key + ' -->)');
        html = html.replace(re, '$1' + pencilBtn(key, 'qc-pencil-block'));
      } else {
        var btn = pencilBtn(key);
        html = html.replace(
          new RegExp('(<!-- QC:' + key + ' -->)([\\s\\S]*?)(<!-- /QC:' + key + ' -->)', 'g'),
          '$1<span class="qc-text" data-qc-key="' + key + '">$2</span>' + btn + '$3'
        );
      }
    });

    if (!pencilsOn) {
      html = html.replace('<body ', '<body class="no-pencils" ');
      html = html.replace('<body>', '<body class="no-pencils">');
    }
    return html;
  }

  // ── iframe rendering ──────────────────────────────────────────────────────

  function mergedSecs() {
    var secs = parseContent(originalMd);
    for (var sid in draft) {
      if (!secs[sid]) secs[sid] = {};
      for (var k in draft[sid]) secs[sid][k] = draft[sid][k];
    }
    return secs;
  }

  function saveScroll() {
    try { iframeScroll = frame.contentDocument.documentElement.scrollTop || 0; } catch (e) {}
  }

  function renderIframe() {
    var secs = mergedSecs();
    var html = iframeSrcHtml;
    html = html.replace('<head>', '<head>\n<base href="' + window.location.origin + '/" />');
    html = applyDraft(html, secs);
    html = injectFieldPencils(html);
    var scroll = iframeScroll;
    frame.onload = function () {
      try { frame.contentDocument.documentElement.scrollTop = scroll; } catch (e) {}
      frame.onload = null;
    };
    frame.srcdoc = html;
  }

  // ── Live update dispatch ──────────────────────────────────────────────────
  //
  // For list items the engine passes a parsed object to liveUpdate. For
  // simple fields it passes the rendered HTML. Fields without a liveUpdate
  // function fall back to the default qcText message handled inside the
  // iframe script.

  function sendLive(key, value) {
    if (!frame.contentWindow) return;
    var owner = getListOwner(key);
    if (owner) {
      var lf = owner.field;
      var item = (typeof value === 'object' && value !== null)
        ? value
        : (lf.parseItem ? lf.parseItem(value || '') : value);
      if (typeof lf.liveUpdate === 'function') {
        try { lf.liveUpdate(frame.contentDocument, key, item); } catch (e) {}
      }
      return;
    }
    var f = FIELDS[key];
    if (!f) return;
    if (typeof f.liveUpdate === 'function') {
      try { f.liveUpdate(frame.contentDocument, key, renderField(key, value)); } catch (e) {}
      return;
    }
    frame.contentWindow.postMessage({
      type: 'qc-live',
      key:  key,
      html: renderField(key, value),
    }, '*');
  }

  function sendPencilState(key) {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type:  'qc-pencil-dirty',
      key:   key,
      dirty: isDirty(key),
    }, '*');
  }

  // ── Popup editor ──────────────────────────────────────────────────────────

  function positionPopup(rect) {
    var W   = window.innerWidth;
    var H   = window.innerHeight;
    var fr  = frame.getBoundingClientRect();
    var popW = 310;
    var popH = popup.offsetHeight || 220;

    var x = fr.left + rect.x;
    var y = fr.top  + rect.y + rect.h + 8;

    if (x + popW > W - 8) x = W - popW - 8;
    if (y + popH > H - 8) y = fr.top + rect.y - popH - 6;
    if (x < 8)            x = 8;
    if (y < fr.top + 8)   y = fr.top + rect.y + rect.h + 8;

    popup.style.left = x + 'px';
    popup.style.top  = y + 'px';
  }

  function buildItemPopupBody(listField, currentItem) {
    var schema = listField.itemSchema || {};
    var keys = Object.keys(schema);
    var rows = '';
    keys.forEach(function (partKey) {
      var p = schema[partKey];
      var val = currentItem[partKey] || '';
      var input = (p.type === 'textarea')
        ? '<textarea class="adm-field-textarea" data-item-part="' + partKey + '" rows="3">' + esc(val) + '</textarea>'
        : '<input class="adm-field-input" data-item-part="' + partKey + '" type="text" value="' + esc(val) + '">';
      rows += '<div class="adm-field">' +
              '<label class="adm-field-label">' + esc(p.label || partKey) + '</label>' +
              input +
              '</div>';
    });
    return rows;
  }

  function buildPopupBody(key, value) {
    var owner = getListOwner(key);
    if (owner) {
      var item = owner.field.parseItem ? owner.field.parseItem(value) : { value: value };
      return buildItemPopupBody(owner.field, item);
    }
    var f = FIELDS[key] || {};
    if (f.type === 'textarea') {
      return '<textarea class="adm-field-textarea" id="adm-popup-input" rows="4">' + esc(value) + '</textarea>';
    }
    return '<input class="adm-field-input" id="adm-popup-input" type="text" value="' + esc(value) + '">';
  }

  function readItemFromPopup(listField) {
    var item = {};
    Object.keys(listField.itemSchema || {}).forEach(function (p) {
      var el = popupBody.querySelector('[data-item-part="' + p + '"]');
      item[p] = el ? el.value : '';
    });
    return item;
  }

  function readPopupRaw() {
    var owner = getListOwner(activeKey);
    if (owner) {
      var item = readItemFromPopup(owner.field);
      return owner.field.serializeItem ? owner.field.serializeItem(item) : '';
    }
    return (document.getElementById('adm-popup-input') || {}).value || '';
  }

  function attachLiveListeners() {
    var owner = getListOwner(activeKey);
    if (owner) {
      var f = owner.field;
      popupBody.querySelectorAll('[data-item-part]').forEach(function (inp) {
        inp.addEventListener('input', function () {
          sendLive(activeKey, readItemFromPopup(f));
          updateDirty();
        });
      });
      return;
    }
    var single = document.getElementById('adm-popup-input');
    if (single) {
      single.addEventListener('input', function () {
        sendLive(activeKey, single.value);
        updateDirty();
      });
    }
  }

  function openPopup(key, rect) {
    if (activeKey && activeKey !== key) confirmPopup();

    var owner = getListOwner(key);
    var labelText, hintText, value;

    if (owner) {
      var lf = owner.field;
      value     = getCurrentValueRaw(lf.section, key);
      labelText = lf.label + ' — ' + key;
      hintText  = lf.hint || '';
    } else {
      var f = FIELDS[key];
      if (!f) return;
      value     = getCurrentValueRaw(f.section, f.sub);
      labelText = f.label;
      hintText  = f.hint || (f.type !== 'input' ? 'Markdown: *italic*, **bold**' : '');
    }

    activeKey = key;
    popupPrev = value;

    popupLabel.textContent = labelText;
    popupHint.textContent  = hintText;
    popupBody.innerHTML    = buildPopupBody(key, value);

    popup.style.display = 'flex';
    popup.classList.add('is-open');
    positionPopup(rect);
    attachLiveListeners();

    var first = popupBody.querySelector('input, textarea');
    if (first) setTimeout(function () { first.focus(); if (first.select) first.select(); }, 60);
  }

  function confirmPopup() {
    if (!activeKey) return;
    var key   = activeKey;
    var raw   = readPopupRaw();
    var owner = getListOwner(key);
    if (owner) {
      setDraftValue(owner.field.section, key, raw);
    } else {
      var f = FIELDS[key];
      if (f) setDraftValue(f.section, f.sub, raw);
    }
    updateDirty();
    activeKey = null;
    popupPrev = null;
    popup.style.display = 'none';
    popup.classList.remove('is-open');
    frameOver.hidden = true;
    sendPencilState(key);
  }

  function cancelPopup() {
    if (!activeKey) return;
    var key = activeKey;
    sendLive(key, popupPrev || '');
    activeKey = null;
    popupPrev = null;
    popup.style.display = 'none';
    popup.classList.remove('is-open');
    frameOver.hidden = true;
    updateDirty();   // restore correct enabled state after cancel
  }

  // ── Page selector (multi-page mode) ───────────────────────────────────────

  var pageSelectEl = null;

  function buildPageSelector() {
    if (!IS_MULTIPAGE) return;
    var brand = document.querySelector('.adm-brand');
    if (!brand) return;
    var sel = document.createElement('select');
    sel.id = 'adm-page-select';
    sel.className = 'adm-page-select';
    sel.setAttribute('aria-label', 'Select page to edit');
    PAGES.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.label || p.id;
      sel.appendChild(opt);
    });
    sel.value = activePage;
    sel.addEventListener('change', function () {
      var requested = sel.value;
      if (!switchPage(requested)) {
        // User declined or switch failed; revert selector.
        sel.value = activePage;
      }
    });
    brand.appendChild(sel);
    pageSelectEl = sel;
  }

  function updateViewLiveHref() {
    var live = document.getElementById('adm-view-live');
    if (!live || !IS_MULTIPAGE) return;
    var url = pageSiteUrl(activePage);
    if (url) live.href = url;
  }

  // Returns true if switch happened, false if cancelled.
  function switchPage(newId) {
    if (newId === activePage) return true;
    if (activeKey) confirmPopup();
    if (countDirty() > 0) {
      var ok = window.confirm(
        'You have unsaved changes on the current page. Discard them and switch pages?'
      );
      if (!ok) return false;
      // Discard: clear in place so the shared reference stays consistent.
      Object.keys(draft).forEach(function (k) { delete draft[k]; });
    }
    saveScroll();
    syncActiveToPageState();

    activePage = newId;
    loadActiveFromPageState();
    updateViewLiveHref();

    var ps = getPageState(activePage);
    if (!ps.loaded) {
      var token = getToken();
      if (token) {
        loadContent(token);
      } else {
        _afterToken = function (t) { loadContent(t); };
        showTokenDialog();
      }
    } else {
      renderIframe();
      updateDirty();
    }
    return true;
  }

  // ── Pencil toggle ─────────────────────────────────────────────────────────

  pencilToggle.addEventListener('click', function () {
    pencilsOn = !pencilsOn;
    pencilToggle.classList.toggle('is-active', pencilsOn);
    pencilToggle.setAttribute('aria-pressed', String(pencilsOn));
    document.getElementById('adm-pencils-label').textContent = pencilsOn ? 'Disable Editing' : 'Enable Editing';
    if (frame.contentWindow) {
      frame.contentWindow.postMessage({ type: 'qc-pencils', on: pencilsOn }, '*');
    }
  });

  // ── GitHub API ────────────────────────────────────────────────────────────

  function toB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function fromB64(str) {
    var bytes = Uint8Array.from(atob(str.replace(/\s/g, '')), function (c) { return c.charCodeAt(0); });
    return new TextDecoder('utf-8').decode(bytes);
  }
  function ghHeaders(token) {
    return {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  async function loadContent(token) {
    setStatus('Loading…');
    var loadingPage = activePage;   // capture in case user switches mid-fetch
    try {
      var results = await Promise.all([
        fetch(contentApi(loadingPage), { headers: ghHeaders(token), cache: 'no-cache' }),
        fetch(pageSiteUrl(loadingPage), { cache: 'no-cache' }),
      ]);
      var mdRes   = results[0];
      var siteRes = results[1];

      if (mdRes.status === 401 || mdRes.status === 403) {
        throw Object.assign(new Error('Token invalid or expired.'), { code: 'auth' });
      }
      if (!mdRes.ok) throw new Error('GitHub API returned HTTP ' + mdRes.status);

      var json = await mdRes.json();
      var siteText = await siteRes.text();

      // Write directly to the page's cache; only mirror to active vars if the
      // user hasn't switched away while we were fetching.
      var ps = getPageState(loadingPage);
      ps.fileSha       = json.sha;
      ps.originalMd    = fromB64(json.content);
      ps.iframeSrcHtml = siteText;
      ps.loaded        = true;

      if (loadingPage === activePage) {
        loadActiveFromPageState();
        loadMarked(function () {
          renderIframe();
          setStatus('Ready', 'is-ok');
          clearStatus(2000);
        });
      } else {
        // User switched pages during load; just ensure marked is available
        // for whenever they come back.
        loadMarked(function () {});
      }
    } catch (err) {
      if (err.code === 'auth') { clearToken(); showTokenDialog(err.message); }
      else { setStatus('Load failed: ' + err.message, 'is-err'); }
    }
  }

  async function doPublish(token) {
    if (!originalMd) { setStatus('Content not loaded.', 'is-err'); return; }
    if (activeKey) confirmPopup();
    publishBtn.disabled = true;
    setStatus('Saving…');
    var publishPage = activePage;
    var commitMsg = 'Update ' + (publishPage === '_default' ? 'site' : publishPage)
                  + ' content via staging editor';
    try {
      var mdText = buildMarkdown();
      var putRes = await fetch(contentApi(publishPage), {
        method: 'PUT',
        headers: ghHeaders(token),
        body: JSON.stringify({
          message: commitMsg,
          content: toB64(mdText),
          sha:     fileSha,
          branch:  GITHUB_BRANCH,
        }),
      });
      if (putRes.status === 401 || putRes.status === 403) {
        throw Object.assign(new Error('Token lacks write permission.'), { code: 'auth' });
      }
      if (!putRes.ok) {
        var body = await putRes.json().catch(function () { return {}; });
        throw new Error(body.message || 'Commit failed (HTTP ' + putRes.status + ').');
      }
      var putJson = await putRes.json();
      fileSha    = putJson.content.sha;
      originalMd = mdText;
      draft = {};

      setStatus('Saved — deploying…');
      var depRes = await fetch(DEPLOY_API, {
        method: 'POST',
        headers: ghHeaders(token),
        body: JSON.stringify({ ref: GITHUB_BRANCH, inputs: { target: DEPLOY_TARGET } }),
      });
      if (depRes.status === 401 || depRes.status === 403) {
        throw Object.assign(new Error('Token lacks Actions permission.'), { code: 'auth' });
      }
      if (depRes.status !== 204) throw new Error('Deploy trigger failed (HTTP ' + depRes.status + ').');

      syncActiveToPageState();
      updateDirty();
      saveScroll();
      renderIframe();
      setStatus('Published! Staging rebuilds in ~30 sec.', 'is-ok');
      clearStatus(12000);
    } catch (err) {
      if (err.code === 'auth') {
        clearToken();
        _afterToken = function (t) { doPublish(t); };
        showTokenDialog(err.message);
      } else {
        setStatus('Publish failed: ' + err.message, 'is-err');
        updateDirty();
      }
    }
  }

  // ── Token dialog ──────────────────────────────────────────────────────────

  function showTokenDialog(msg) {
    tokenInput.value  = '';
    tokenError.hidden = !msg;
    if (msg) tokenError.textContent = msg;
    tokenDialog.showModal();
    setTimeout(function () { tokenInput.focus(); }, 50);
  }

  tokenCancel.addEventListener('click', function () { tokenDialog.close(); });
  tokenDialog.addEventListener('click', function (e) { if (e.target === tokenDialog) tokenDialog.close(); });
  tokenForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = tokenInput.value.trim();
    if (!t) { tokenError.textContent = 'Please enter a token.'; tokenError.hidden = false; tokenInput.focus(); return; }
    saveToken(t);
    tokenDialog.close();
    var fn = _afterToken; _afterToken = null;
    if (fn) fn(t); else loadContent(t);
  });

  // ── Event listeners ───────────────────────────────────────────────────────

  window.addEventListener('message', function (e) {
    if (!e.data) return;
    if (e.data.type === 'qc-edit') {
      saveScroll();
      frameOver.hidden = false;
      openPopup(e.data.key, e.data.rect);
    } else if (e.data.type === 'qc-iframe-click') {
      if (activeKey) cancelPopup();
    }
  });
  popupConfirm.addEventListener('click', function (e) { e.stopPropagation(); confirmPopup(); });
  popupCancel.addEventListener('click',  function (e) { e.stopPropagation(); cancelPopup(); });

  popupBody.addEventListener('keydown', function (e) {
    if (e.key === 'Escape')   { e.preventDefault(); cancelPopup(); }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); confirmPopup(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && popup.classList.contains('is-open')) cancelPopup();
  });

  publishBtn.addEventListener('click', function () {
    var token = getToken();
    if (token) { doPublish(token); return; }
    _afterToken = function (t) { doPublish(t); };
    showTokenDialog();
  });

  window.addEventListener('beforeunload', function (e) {
    if (countDirty() > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  (function init() {
    buildPageSelector();
    updateViewLiveHref();
    var token = getToken();
    if (token) { loadContent(token); return; }
    showTokenDialog();
  })();

})();
