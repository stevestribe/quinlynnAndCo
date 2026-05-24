/**
 * Quinlynn & Co. staging admin — generic CMS engine.
 *
 * Site-specific config lives in admin-fields.js which must be loaded first.
 * It exposes three globals:
 *   window.ADMIN_CONFIG        — repo, paths, deploy workflow
 *   window.ADMIN_FIELDS        — flat map of every editable field
 *   window.ADMIN_SECTION_ORDER — ordered list for markdown serialisation
 */
(function () {
  'use strict';

  // ── Config (from admin-fields.js) ─────────────────────────────────────────

  var CFG    = window.ADMIN_CONFIG        || {};
  var FIELDS = window.ADMIN_FIELDS        || {};
  var ORDER  = window.ADMIN_SECTION_ORDER || [];

  var GITHUB_REPO   = CFG.githubRepo     || '';
  var GITHUB_BRANCH = CFG.githubBranch   || 'main';
  var CONTENT_PATH  = CFG.contentPath    || '';
  var DEPLOY_WF     = CFG.deployWorkflow || 'deploy-staging.yml';
  var DEPLOY_TARGET = CFG.deployTarget   || 'staging';
  var SITE_INDEX    = CFG.siteIndexUrl   || '/index.html';

  var CONTENT_API = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + CONTENT_PATH;
  var DEPLOY_API  = 'https://api.github.com/repos/' + GITHUB_REPO + '/actions/workflows/' + DEPLOY_WF + '/dispatches';
  var TOKEN_KEY   = 'admin_github_token';

  // ── State ─────────────────────────────────────────────────────────────────

  var originalMd    = '';
  var fileSha       = '';
  var iframeSrcHtml = '';
  var draft         = {};          // { section: { sub: value } }
  var iframeScroll  = 0;
  var activeKey     = null;        // field key whose popup is open
  var popupPrev     = null;        // value/cardData before popup opened (for cancel)
  var pencilsOn     = true;        // pencil toggle state
  var _afterToken   = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────

  var frame         = document.getElementById('adm-frame');
  var frameOver     = document.getElementById('adm-frame-overlay');
  var dirtyMsg      = document.getElementById('adm-dirty-msg');
  var statusEl      = document.getElementById('adm-status');
  var publishBtn    = document.getElementById('adm-publish');
  var pencilToggle  = document.getElementById('adm-pencils-toggle');
  var popup         = document.getElementById('adm-popup');
  var popupLabel    = document.getElementById('adm-popup-label');
  var popupBody     = document.getElementById('adm-popup-body');
  var popupHint     = document.getElementById('adm-popup-hint');
  var popupConfirm  = document.getElementById('adm-popup-confirm');
  var popupCancel   = document.getElementById('adm-popup-cancel');
  var tokenDialog   = document.getElementById('token-dialog');
  var tokenForm     = document.getElementById('token-form');
  var tokenInput    = document.getElementById('token-input');
  var tokenError    = document.getElementById('token-error');
  var tokenCancel   = document.getElementById('token-cancel-btn');

  // ── Utilities ─────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function mdInline(text) {
    if (!text) return '';
    var t = text.trim();
    if (window.marked) {
      var h = window.marked.parse(t);
      return h.replace(/^<p>/, '').replace(/<\/p>\s*$/, '');
    }
    return t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,     '<em>$1</em>');
  }

  /**
   * Render a raw field value into the HTML that should appear in the live
   * iframe. Mirrors build-site.py rendering rules exactly.
   */
  function renderHtml(key, value) {
    if (value === undefined || value === null) return '';
    if (key === 'about-quote')    return '“' + mdInline(value) + '”';
    if (key === 'about-meta') {
      var ml = value.split('\n').filter(function (l) { return l.trim(); });
      return ml.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    }
    if (key === 'inquire-thanks-p') return esc(value);
    if (key.startsWith('label-') || key === 'about-sign') return esc(value);
    return mdInline(value);
  }

  function parseCard(raw) {
    var lines  = (raw || '').split('\n').map(function (l) { return l.trim(); });
    var pieces = (lines[0] || '').split('|').map(function (p) { return p.trim(); });
    return { name: pieces[0] || '', price: pieces[1] || '', tag: pieces[2] || '', desc: lines[1] || '' };
  }

  function serializeCard(cd) {
    return (cd.name || '') + ' | ' + (cd.price || '') + ' | ' + (cd.tag || '') + '\n' + (cd.desc || '');
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
    s.src    = 'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js';
    s.onload  = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  // ── Draft helpers ─────────────────────────────────────────────────────────

  function getDraftValue(fieldKey) {
    var f = FIELDS[fieldKey];
    if (!f) return undefined;
    return (draft[f.section] || {})[f.sub];
  }

  function setDraftValue(fieldKey, value) {
    var f = FIELDS[fieldKey];
    if (!f) return;
    if (!draft[f.section]) draft[f.section] = {};
    draft[f.section][f.sub] = value;
  }

  function clearDraftValue(fieldKey) {
    var f = FIELDS[fieldKey];
    if (!f) return;
    if (draft[f.section]) delete draft[f.section][f.sub];
  }

  function getCurrentValue(fieldKey) {
    var dv = getDraftValue(fieldKey);
    if (dv !== undefined) return dv;
    var f    = FIELDS[fieldKey];
    if (!f) return '';
    var secs = parseContent(originalMd);
    return (secs[f.section] || {})[f.sub] || '';
  }

  function countDirty() {
    var n = 0;
    for (var k in draft) { if (Object.keys(draft[k]).length > 0) n++; }
    return n;
  }

  function updateDirty() {
    var dirty = countDirty() > 0;
    publishBtn.disabled = !dirty;
    dirtyMsg.hidden = !dirty;
  }

  // ── Markdown serialiser ───────────────────────────────────────────────────

  function buildMarkdown() {
    var secs = parseContent(originalMd);
    for (var sid in draft) {
      if (!secs[sid]) secs[sid] = {};
      for (var k in draft[sid]) secs[sid][k] = draft[sid][k];
    }
    var fm    = getFrontmatter(originalMd).trimEnd();
    var parts = [fm];
    ORDER.forEach(function (s) {
      var sec = secs[s.id];
      if (!sec) return;
      parts.push('\n## ' + s.id);
      s.keys.forEach(function (k) {
        var v = sec[k];
        if (v === undefined || v === null) return;
        parts.push('\n### ' + k);
        parts.push(v);
      });
    });
    return parts.join('\n') + '\n';
  }

  // ── Product card renderer ─────────────────────────────────────────────────

  var CARD_COLORS = ['warm', 'sage', '', 'taupe', 'deep', 'warm'];
  var ARROW_SVG   = '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16h20M19 9l7 7-7 7" /></svg>';

  function renderCards(prods) {
    var parts = [];
    for (var i = 0; i < 6; i++) {
      var text = prods['card' + (i + 1)] || '';
      if (!text) continue;
      var cd    = parseCard(text);
      var color = CARD_COLORS[i];
      var phCls = 'ph' + (color ? ' ' + color : '') + ' inner';
      parts.push(
        '\n        <a class="pcard" data-card-key="card' + (i + 1) + '" href="https://thewaysofherhome.etsy.com" ' +
        'target="_blank" rel="noopener noreferrer">\n' +
        '          <div class="pcard-img"><div class="' + phCls + '">' +
        (cd.tag ? '<span class="ph-tag">' + esc(cd.tag) + '</span>' : '') + '</div></div>\n' +
        '          <div class="pcard-meta">\n' +
        '            <div class="pcard-name">' + esc(cd.name) + '</div>\n' +
        '            <div class="pcard-price">' + esc(cd.price) + '</div>\n' +
        (cd.desc ? '            <p class="pcard-desc">' + esc(cd.desc) + '</p>\n' : '') +
        '            <span class="pcard-cta">View on Etsy\n              ' + ARROW_SVG + '\n            </span>\n' +
        '          </div>\n        </a>\n'
      );
    }
    return parts.join('');
  }

  // ── QC injection (content values) ────────────────────────────────────────

  function injectQC(html, key, value) {
    return html.replace(
      new RegExp('(<!-- QC:' + key + ' -->)[\\s\\S]*?(<!-- /QC:' + key + ' -->)', 'g'),
      '$1' + value + '$2'
    );
  }

  function applyDraft(html, secs) {
    function g(s, k) { return (secs[s] || {})[k] || ''; }

    var lab = secs.labels || {};
    if (lab.about)    html = injectQC(html, 'label-about',    esc(lab.about));
    if (lab.products) html = injectQC(html, 'label-products', esc(lab.products));
    if (lab.contact)  html = injectQC(html, 'label-contact',  esc(lab.contact));

    var hT = mdInline(g('hero', 'title')); if (hT) html = injectQC(html, 'hero-title', hT);
    var hS = mdInline(g('hero', 'sub'));   if (hS) html = injectQC(html, 'hero-sub',   hS);

    var aH  = mdInline(g('about', 'heading'));  if (aH)  html = injectQC(html, 'about-heading', aH);
    var aB1 = mdInline(g('about', 'bio1'));     if (aB1) html = injectQC(html, 'about-bio1',    aB1);
    var aQ  = mdInline(g('about', 'quote'));
    if (aQ)  html = injectQC(html, 'about-quote', '“' + aQ + '”');
    var aB2 = mdInline(g('about', 'bio2'));     if (aB2) html = injectQC(html, 'about-bio2',    aB2);
    var aS  = mdInline(g('about', 'sign'));     if (aS)  html = injectQC(html, 'about-sign',    aS);
    var aMeta = g('about', 'meta');
    if (aMeta) {
      var ml = aMeta.split('\n').filter(function (l) { return l.trim(); });
      html = injectQC(html, 'about-meta',
        '\n          ' + ml.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('\n          ') + '\n        ');
    }

    var pH = mdInline(g('products', 'heading')); if (pH) html = injectQC(html, 'products-heading', pH);
    var pC = renderCards(secs.products || {});   if (pC) html = injectQC(html, 'products-cards',   pC);

    var iH  = mdInline(g('inquire', 'heading'));  if (iH)  html = injectQC(html, 'inquire-heading',  iH);
    var iL  = mdInline(g('inquire', 'lede'));      if (iL)  html = injectQC(html, 'inquire-lede',     iL);
    var iTH = mdInline(g('inquire', 'thanks-h')); if (iTH) html = injectQC(html, 'inquire-thanks-h', iTH);
    var iTP = esc(g('inquire', 'thanks-p'));       if (iTP) html = injectQC(html, 'inquire-thanks-p', iTP);

    var fT = mdInline(g('footer', 'tagline')); if (fT) html = injectQC(html, 'footer-tagline', fT);

    return html;
  }

  // ── Pencil injection ──────────────────────────────────────────────────────

  var PENCIL_SVG = '<svg width="11" height="11" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 4l6 6L10 28H4v-6L22 4z"/></svg>';

  // Injected into iframe <head>. Handles live text updates without a full re-render.
  var IFRAME_STYLE = (
    /* Pencil buttons */
    '.qc-pencil{display:inline-flex;align-items:center;justify-content:center;' +
    'width:17px;height:17px;margin-left:5px;padding:0;' +
    'background:rgba(110,130,110,0.45);color:#fff;border:none;border-radius:3px;' +
    'cursor:pointer;opacity:0.25;vertical-align:middle;' +
    'transition:opacity .18s,background .18s;flex-shrink:0;}' +
    '.qc-pencil.qc-pencil-block{display:block;margin:6px 0 0;}' +
    '.qc-pencil:hover{opacity:1!important;background:rgba(85,102,85,.9);}' +
    '.qc-pencil.is-dirty{opacity:0.75;outline:2px solid rgba(90,138,90,.55);outline-offset:2px;}' +
    '*:hover>.qc-pencil{opacity:0.7;}' +
    /* Hide all pencils when body has no-pencils class */
    'body.no-pencils .qc-pencil{display:none!important;}' +
    /* Block external nav/form interaction in preview */
    'a[target="_blank"]{pointer-events:none!important;}' +
    'form{pointer-events:none!important;}'
  );

  // Script injected into iframe <body> end. Receives live-update messages.
  var IFRAME_SCRIPT = (
    '<script>(function(){' +
    'window.qcEdit=function(key,btn){' +
    'var r=btn.getBoundingClientRect();' +
    'window.parent.postMessage({type:"qc-edit",key:key,rect:{x:r.left,y:r.top,w:r.width,h:r.height}},"*");' +
    '};' +
    'window.addEventListener("message",function(e){' +
    'if(!e.data)return;' +
    'var t=e.data.type,key=e.data.key;' +
    'if(t==="qc-pencils"){document.body.classList.toggle("no-pencils",!e.data.on);return;}' +
    'if(t==="qc-pencil-dirty"){' +
    'document.querySelectorAll(".qc-pencil[data-qc-key=\\""+key+"\\"]").forEach(function(p){p.classList.toggle("is-dirty",!!e.data.dirty);});' +
    'return;}' +
    'if(t!=="qc-live")return;' +
    'if(key==="about-meta"){' +
    'var c=document.querySelector(".about-aside-meta");' +
    'if(!c)return;' +
    'var p=c.querySelector(".qc-pencil");' +
    'c.innerHTML=e.data.html||"";' +
    'if(p)c.appendChild(p);' +
    'return;}' +
    'if(/^card\\d$/.test(key)){' +
    'var pc=document.querySelector("[data-card-key=\\""+key+"\\"]");' +
    'if(!pc||!e.data.cd)return;' +
    'var d=e.data.cd;' +
    'var n=pc.querySelector(".pcard-name");if(n)n.textContent=d.name||"";' +
    'var pr=pc.querySelector(".pcard-price");if(pr)pr.textContent=d.price||"";' +
    'var tg=pc.querySelector(".ph-tag");if(tg)tg.textContent=d.tag||"";' +
    'var ds=pc.querySelector(".pcard-desc");if(ds)ds.textContent=d.desc||"";' +
    'return;}' +
    'document.querySelectorAll("span.qc-text[data-qc-key=\\""+key+"\\"]").forEach(function(s){s.innerHTML=e.data.html||"";});' +
    '});' +
    '})();<' + '/script>'
  );

  function isDirty(fieldKey) {
    return getDraftValue(fieldKey) !== undefined;
  }

  function pencilBtn(key, blockClass) {
    var cls = 'qc-pencil' + (blockClass ? ' ' + blockClass : '') + (isDirty(key) ? ' is-dirty' : '');
    var f   = FIELDS[key] || {};
    return '<button class="' + cls + '" data-qc-key="' + key + '" ' +
      'aria-label="Edit ' + (f.label || key) + '" ' +
      'onclick="event.preventDefault();qcEdit(\'' + key + '\',this)">' +
      PENCIL_SVG + '</button>';
  }

  function injectFieldPencils(html) {
    // Inject styles
    html = html.replace('</head>', '<style>' + IFRAME_STYLE + '</style>\n</head>');
    // Inject live-update script
    html = html.replace('</body>', IFRAME_SCRIPT + '\n</body>');

    // Wrap every QC text region with <span class="qc-text"> and append pencil
    // Excludes about-meta (block content), products-cards (per-card below)
    var textKeys = Object.keys(FIELDS).filter(function (k) {
      return FIELDS[k].type !== 'card' && k !== 'about-meta';
    });

    textKeys.forEach(function (key) {
      var btn = pencilBtn(key);
      html = html.replace(
        new RegExp('(<!-- QC:' + key + ' -->)([\\s\\S]*?)(<!-- /QC:' + key + ' -->)', 'g'),
        '$1<span class="qc-text" data-qc-key="' + key + '">$2</span>' + btn + '$3'
      );
    });

    // about-meta: pencil button after closing marker
    html = html.replace(
      /(<!-- \/QC:about-meta -->)/,
      '$1' + pencilBtn('about-meta', 'qc-pencil-block')
    );

    // Per-card pencils (renderCards adds data-card-key)
    for (var i = 1; i <= 6; i++) {
      var key = 'card' + i;
      if (!FIELDS[key]) continue;
      var btn = pencilBtn(key);
      html = html.replace(
        new RegExp('(data-card-key="' + key + '"[^>]*>)', 'g'),
        '$1' + btn
      );
    }

    // Apply pencil visibility state
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

  // ── Live update (postMessage to iframe) ───────────────────────────────────

  function sendLive(key, rawValue, cardData) {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type: 'qc-live',
      key:  key,
      html: cardData ? null : renderHtml(key, rawValue),
      cd:   cardData || null,
    }, '*');
  }

  // ── Popup ─────────────────────────────────────────────────────────────────

  function positionPopup(rect) {
    var W      = window.innerWidth;
    var H      = window.innerHeight;
    var fr     = frame.getBoundingClientRect();
    var popW   = 310;
    var popH   = popup.offsetHeight || 220;

    var x = fr.left + rect.x;
    var y = fr.top  + rect.y + rect.h + 8;

    if (x + popW > W - 8) x = W - popW - 8;
    if (y + popH > H - 8) y = fr.top + rect.y - popH - 6;
    if (x < 8)            x = 8;
    if (y < fr.top + 8)   y = fr.top + rect.y + rect.h + 8;

    popup.style.left = x + 'px';
    popup.style.top  = y + 'px';
  }

  function buildPopupBody(fieldKey, value) {
    var f = FIELDS[fieldKey] || {};
    if (f.type === 'card') {
      var cd = parseCard(value);
      return (
        '<div class="adm-row-2">' +
          '<div class="adm-field"><label class="adm-field-label">Name</label>' +
          '<input class="adm-field-input" data-card-part="name" type="text" value="' + esc(cd.name) + '"></div>' +
          '<div class="adm-field"><label class="adm-field-label">Price</label>' +
          '<input class="adm-field-input" data-card-part="price" type="text" value="' + esc(cd.price) + '"></div>' +
        '</div>' +
        '<div class="adm-field"><label class="adm-field-label">Tag</label>' +
        '<input class="adm-field-input" data-card-part="tag" type="text" value="' + esc(cd.tag) + '"></div>' +
        '<div class="adm-field"><label class="adm-field-label">Description</label>' +
        '<input class="adm-field-input" data-card-part="desc" type="text" value="' + esc(cd.desc) + '"></div>'
      );
    }
    if (f.type === 'textarea') {
      return '<textarea class="adm-field-textarea" id="adm-popup-input" rows="4">' + esc(value) + '</textarea>';
    }
    return '<input class="adm-field-input" id="adm-popup-input" type="text" value="' + esc(value) + '">';
  }

  function readPopupValue() {
    var f = FIELDS[activeKey] || {};
    if (f.type === 'card') {
      var cd = {
        name:  (popupBody.querySelector('[data-card-part="name"]')  || {}).value || '',
        price: (popupBody.querySelector('[data-card-part="price"]') || {}).value || '',
        tag:   (popupBody.querySelector('[data-card-part="tag"]')   || {}).value || '',
        desc:  (popupBody.querySelector('[data-card-part="desc"]')  || {}).value || '',
      };
      return serializeCard(cd);
    }
    return (document.getElementById('adm-popup-input') || {}).value || '';
  }

  function readCardData() {
    return {
      name:  (popupBody.querySelector('[data-card-part="name"]')  || {}).value || '',
      price: (popupBody.querySelector('[data-card-part="price"]') || {}).value || '',
      tag:   (popupBody.querySelector('[data-card-part="tag"]')   || {}).value || '',
      desc:  (popupBody.querySelector('[data-card-part="desc"]')  || {}).value || '',
    };
  }

  function attachLiveListeners() {
    var f = FIELDS[activeKey] || {};
    if (f.type === 'card') {
      popupBody.querySelectorAll('.adm-field-input').forEach(function (inp) {
        inp.addEventListener('input', function () {
          sendLive(activeKey, null, readCardData());
        });
      });
    } else {
      var inp = document.getElementById('adm-popup-input');
      if (inp) {
        inp.addEventListener('input', function () {
          sendLive(activeKey, inp.value, null);
        });
      }
    }
  }

  function openPopup(fieldKey, rect) {
    // Auto-confirm any open popup before switching
    if (activeKey && activeKey !== fieldKey) confirmPopup();

    var f     = FIELDS[fieldKey];
    if (!f) return;
    var value = getCurrentValue(fieldKey);

    activeKey  = fieldKey;
    popupPrev  = value;

    popupLabel.textContent = f.label;
    popupHint.textContent  = f.hint || (f.type !== 'input' ? 'Markdown: *italic*, **bold**' : '');
    popupBody.innerHTML    = buildPopupBody(fieldKey, value);

    popup.hidden = false;
    positionPopup(rect);
    attachLiveListeners();

    var first = popupBody.querySelector('input, textarea');
    if (first) setTimeout(function () { first.focus(); if (first.select) first.select(); }, 60);
  }

  function confirmPopup() {
    if (!activeKey) return;
    var value = readPopupValue();
    setDraftValue(activeKey, value);
    updateDirty();
    var key = activeKey;
    activeKey = null;
    popupPrev = null;
    popup.hidden = true;
    frameOver.hidden = true;
    // Update pencil dirty state in iframe
    sendPencilState(key);
  }

  function cancelPopup() {
    if (!activeKey) return;
    // Revert live preview to previous value
    var f = FIELDS[activeKey];
    if (f && f.type === 'card') {
      sendLive(activeKey, null, parseCard(popupPrev || ''));
    } else {
      sendLive(activeKey, popupPrev || '', null);
    }
    activeKey = null;
    popupPrev = null;
    popup.hidden = true;
    frameOver.hidden = true;
  }

  function sendPencilState(key) {
    if (!frame.contentWindow) return;
    // Toggle is-dirty class on the pencil inside the iframe
    frame.contentWindow.postMessage({
      type:  'qc-pencil-dirty',
      key:   key,
      dirty: getDraftValue(key) !== undefined,
    }, '*');
  }

  // ── Pencil toggle ─────────────────────────────────────────────────────────

  pencilToggle.addEventListener('click', function () {
    pencilsOn = !pencilsOn;
    pencilToggle.classList.toggle('is-active', pencilsOn);
    pencilToggle.setAttribute('aria-pressed', String(pencilsOn));
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
    try {
      var results = await Promise.all([
        fetch(CONTENT_API, { headers: ghHeaders(token), cache: 'no-cache' }),
        fetch(SITE_INDEX,  { cache: 'no-cache' }),
      ]);
      var mdRes   = results[0];
      var siteRes = results[1];

      if (mdRes.status === 401 || mdRes.status === 403) {
        throw Object.assign(new Error('Token invalid or expired.'), { code: 'auth' });
      }
      if (!mdRes.ok) throw new Error('GitHub API returned HTTP ' + mdRes.status);

      var json      = await mdRes.json();
      fileSha       = json.sha;
      originalMd    = fromB64(json.content);
      iframeSrcHtml = await siteRes.text();

      loadMarked(function () {
        renderIframe();
        setStatus('Ready', 'is-ok');
        clearStatus(2000);
      });
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
    try {
      var mdText = buildMarkdown();
      var putRes = await fetch(CONTENT_API, {
        method: 'PUT',
        headers: ghHeaders(token),
        body: JSON.stringify({
          message: 'Update home page content via staging editor',
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

      draft = {};
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
    }
  });

  // Close popup when clicking the overlay (but not the iframe content)
  frameOver.addEventListener('click', cancelPopup);

  popupConfirm.addEventListener('click', confirmPopup);
  popupCancel.addEventListener('click', cancelPopup);

  // Keyboard: Enter on input confirms, Escape cancels anywhere
  popupBody.addEventListener('keydown', function (e) {
    if (e.key === 'Escape')   { e.preventDefault(); cancelPopup(); }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); confirmPopup(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !popup.hidden) cancelPopup();
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
    var token = getToken();
    if (token) { loadContent(token); return; }
    showTokenDialog();
  })();

})();
