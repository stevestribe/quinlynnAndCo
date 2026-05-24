(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────

  var GITHUB_REPO   = 'stevestribe/quinlynnAndCo';
  var GITHUB_BRANCH = 'main';
  var CONTENT_PATH  = 'site/content/pages/home.md';
  var CONTENT_API   = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + CONTENT_PATH;
  var DEPLOY_API    = 'https://api.github.com/repos/' + GITHUB_REPO + '/actions/workflows/deploy-staging.yml/dispatches';
  var TOKEN_KEY     = 'admin_github_token';

  // ── Sections config ───────────────────────────────────────────────────────
  // anchor: unique string inside the element's opening tag used for pencil injection

  var SECTIONS = [
    {
      id: 'labels', title: 'Navigation Labels',
      anchor: 'id="site-nav"',
      fields: [
        { key: 'about',    label: 'About section',    type: 'input' },
        { key: 'products', label: 'Products section', type: 'input' },
        { key: 'contact',  label: 'Contact section',  type: 'input' },
      ],
    },
    {
      id: 'hero', title: 'Hero',
      anchor: 'id="top"',
      fields: [
        { key: 'title', label: 'Headline',   type: 'textarea' },
        { key: 'sub',   label: 'Subheading', type: 'textarea' },
      ],
    },
    {
      id: 'about', title: 'About — The Artisans',
      anchor: 'id="about"',
      fields: [
        { key: 'heading', label: 'Section heading',              type: 'textarea' },
        { key: 'bio1',    label: 'Bio paragraph 1',              type: 'textarea' },
        { key: 'quote',   label: 'Pull quote',                   type: 'textarea' },
        { key: 'bio2',    label: 'Bio paragraph 2',              type: 'textarea' },
        { key: 'sign',    label: 'Signature',                    type: 'input' },
        { key: 'meta',    label: 'Aside details (one per line)', type: 'textarea',
          hint: 'e.g. Studio · home, McKinney, TX' },
      ],
    },
    {
      id: 'products', title: 'Products — The Shoppe',
      anchor: 'id="products"',
      fields: [
        { key: 'heading', label: 'Section heading', type: 'textarea' },
        { key: 'card1',   label: 'Card 1', type: 'card' },
        { key: 'card2',   label: 'Card 2', type: 'card' },
        { key: 'card3',   label: 'Card 3', type: 'card' },
        { key: 'card4',   label: 'Card 4', type: 'card' },
        { key: 'card5',   label: 'Card 5', type: 'card' },
        { key: 'card6',   label: 'Card 6', type: 'card' },
      ],
    },
    {
      id: 'inquire', title: 'Inquire',
      anchor: 'id="contact"',
      fields: [
        { key: 'heading',  label: 'Section heading',   type: 'textarea' },
        { key: 'lede',     label: 'Intro paragraph',   type: 'textarea' },
        { key: 'thanks-h', label: 'Thank-you heading', type: 'textarea' },
        { key: 'thanks-p', label: 'Thank-you body',    type: 'textarea' },
      ],
    },
    {
      id: 'footer', title: 'Footer',
      anchor: '<footer',
      fields: [
        { key: 'tagline', label: 'Tagline', type: 'textarea' },
      ],
    },
  ];

  var SECTION_ORDER = [
    { id: 'labels',   keys: ['about', 'products', 'contact'] },
    { id: 'hero',     keys: ['title', 'sub'] },
    { id: 'about',    keys: ['heading', 'bio1', 'quote', 'bio2', 'sign', 'meta'] },
    { id: 'products', keys: ['heading', 'card1', 'card2', 'card3', 'card4', 'card5', 'card6'] },
    { id: 'inquire',  keys: ['heading', 'lede', 'thanks-h', 'thanks-p'] },
    { id: 'footer',   keys: ['tagline'] },
  ];

  // ── State ─────────────────────────────────────────────────────────────────

  var originalMd    = '';
  var fileSha       = '';
  var iframeSrcHtml = '';
  var draft         = {};
  var iframeScroll  = 0;
  var activeSection = null;
  var _afterToken   = null;

  // ── DOM refs ──────────────────────────────────────────────────────────────

  var frame       = document.getElementById('adm-frame');
  var frameOver   = document.getElementById('adm-frame-overlay');
  var panel       = document.getElementById('adm-panel');
  var panelTitle  = document.getElementById('adm-panel-title');
  var panelEdited = document.getElementById('adm-panel-edited');
  var panelBody   = document.getElementById('adm-panel-body');
  var panelClose  = document.getElementById('adm-panel-close');
  var panelRevert = document.getElementById('adm-revert');
  var panelDone   = document.getElementById('adm-done');
  var dirtyMsg    = document.getElementById('adm-dirty-msg');
  var statusEl    = document.getElementById('adm-status');
  var publishBtn  = document.getElementById('adm-publish');
  var tokenDialog = document.getElementById('token-dialog');
  var tokenForm   = document.getElementById('token-form');
  var tokenInput  = document.getElementById('token-input');
  var tokenError  = document.getElementById('token-error');
  var tokenCancel = document.getElementById('token-cancel-btn');

  // ── Utilities ─────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

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

  // ── marked.js ─────────────────────────────────────────────────────────────

  function loadMarked(cb) {
    if (window.marked) { cb(); return; }
    var s = document.createElement('script');
    s.src    = 'https://cdn.jsdelivr.net/npm/marked@9/marked.min.js';
    s.onload  = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  // ── Dirty tracking ────────────────────────────────────────────────────────

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

  // ── Markdown serializer ───────────────────────────────────────────────────

  function buildMarkdown() {
    var secs = parseContent(originalMd);
    for (var sid in draft) {
      if (!secs[sid]) secs[sid] = {};
      for (var k in draft[sid]) secs[sid][k] = draft[sid][k];
    }
    var fm    = getFrontmatter(originalMd).trimEnd();
    var parts = [fm];
    SECTION_ORDER.forEach(function (s) {
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
      var lines  = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) continue;
      var pieces = lines[0].split('|').map(function (p) { return p.trim(); });
      var name   = pieces[0] || '', price = pieces[1] || '', tag = pieces[2] || '';
      var desc   = lines[1] || '';
      var color  = CARD_COLORS[i];
      var phCls  = 'ph' + (color ? ' ' + color : '') + ' inner';
      parts.push(
        '\n        <a class="pcard" href="https://thewaysofherhome.etsy.com" ' +
        'target="_blank" rel="noopener noreferrer">\n' +
        '          <div class="pcard-img"><div class="' + phCls + '">' +
        (tag ? '<span class="ph-tag">' + esc(tag) + '</span>' : '') + '</div></div>\n' +
        '          <div class="pcard-meta">\n' +
        '            <div class="pcard-name">' + esc(name) + '</div>\n' +
        '            <div class="pcard-price">' + esc(price) + '</div>\n' +
        (desc ? '            <p class="pcard-desc">' + esc(desc) + '</p>\n' : '') +
        '            <span class="pcard-cta">View on Etsy\n' +
        '              ' + ARROW_SVG + '\n            </span>\n' +
        '          </div>\n        </a>\n'
      );
    }
    return parts.join('');
  }

  // ── QC injection ──────────────────────────────────────────────────────────

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

    var aH  = mdInline(g('about', 'heading')); if (aH)  html = injectQC(html, 'about-heading', aH);
    var aB1 = mdInline(g('about', 'bio1'));    if (aB1) html = injectQC(html, 'about-bio1',    aB1);
    var aQ  = mdInline(g('about', 'quote'));
    if (aQ)  html = injectQC(html, 'about-quote', '“' + aQ + '”');
    var aB2 = mdInline(g('about', 'bio2')); if (aB2) html = injectQC(html, 'about-bio2', aB2);
    var aS  = mdInline(g('about', 'sign')); if (aS)  html = injectQC(html, 'about-sign', aS);

    var aMeta = g('about', 'meta');
    if (aMeta) {
      var ml = aMeta.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var mh = '\n          ' + ml.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('\n          ') + '\n        ';
      html = injectQC(html, 'about-meta', mh);
    }

    var pH = mdInline(g('products', 'heading')); if (pH) html = injectQC(html, 'products-heading', pH);
    var pC = renderCards(secs.products || {});   if (pC) html = injectQC(html, 'products-cards', pC);

    var iH  = mdInline(g('inquire', 'heading'));  if (iH)  html = injectQC(html, 'inquire-heading', iH);
    var iL  = mdInline(g('inquire', 'lede'));      if (iL)  html = injectQC(html, 'inquire-lede',    iL);
    var iTH = mdInline(g('inquire', 'thanks-h')); if (iTH) html = injectQC(html, 'inquire-thanks-h', iTH);
    var iTP = esc(g('inquire', 'thanks-p'));       if (iTP) html = injectQC(html, 'inquire-thanks-p', iTP);

    var fT = mdInline(g('footer', 'tagline')); if (fT) html = injectQC(html, 'footer-tagline', fT);

    return html;
  }

  // ── Pencil button injection ───────────────────────────────────────────────

  var PENCIL_SVG = '<svg width="12" height="12" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 4l6 6L10 28H4v-6L22 4z"/></svg>';

  var PENCIL_CSS = (
    '#site-nav,section,footer{position:relative!important;}' +
    '.qc-pencil{position:absolute;top:12px;right:12px;width:30px;height:30px;' +
    'background:rgba(110,130,110,0.9);color:#fff;border:none;border-radius:50%;' +
    'cursor:pointer;display:flex;align-items:center;justify-content:center;' +
    'z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.18);transition:background .15s,transform .15s;}' +
    '.qc-pencil:hover{background:rgba(85,102,85,.98);transform:scale(1.1);}' +
    '.qc-pencil.is-dirty{outline:2.5px solid #a8c5a8;outline-offset:2px;}' +
    'a[target="_blank"]{pointer-events:none!important;}' +
    'form{pointer-events:none!important;}'
  );

  function injectPencils(html) {
    html = html.replace('</head>', '<style>' + PENCIL_CSS + '</style>\n</head>');
    SECTIONS.forEach(function (sec) {
      var dirty  = draft[sec.id] && Object.keys(draft[sec.id]).length > 0;
      var cls    = 'qc-pencil' + (dirty ? ' is-dirty' : '');
      var onClick = "window.parent.postMessage({type:'qc-edit',section:'" + sec.id + "'},'*')";
      var btn    = '<button class="' + cls + '" title="Edit ' + sec.title + '" onclick="' + onClick + '">' + PENCIL_SVG + '</button>';
      html = html.replace(new RegExp('(' + escRe(sec.anchor) + '[^>]*>)'), '$1' + btn);
    });
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
    html = injectPencils(html);
    var scroll = iframeScroll;
    frame.onload = function () {
      try { frame.contentDocument.documentElement.scrollTop = scroll; } catch (e) {}
      frame.onload = null;
    };
    frame.srcdoc = html;
  }

  // ── Panel ─────────────────────────────────────────────────────────────────

  function getSec(id) {
    for (var i = 0; i < SECTIONS.length; i++) { if (SECTIONS[i].id === id) return SECTIONS[i]; }
    return null;
  }

  function getValues(secId) {
    var secs = parseContent(originalMd);
    var base = secs[secId] || {};
    var over = draft[secId] || {};
    var out  = {};
    var sec  = getSec(secId);
    if (!sec) return out;
    sec.fields.forEach(function (f) {
      out[f.key] = (over[f.key] !== undefined) ? over[f.key] : (base[f.key] || '');
    });
    return out;
  }

  function renderField(field, val) {
    var fid = 'adm-f-' + field.key.replace(/-/g, '_');
    if (field.type === 'card') {
      var lines  = (val || '').split('\n').map(function (l) { return l.trim(); });
      var pieces = (lines[0] || '').split('|').map(function (p) { return p.trim(); });
      var name = pieces[0] || '', price = pieces[1] || '', tag = pieces[2] || '', desc = lines[1] || '';
      return (
        '<div class="adm-card-field" data-card-key="' + field.key + '">' +
          '<div class="adm-card-field-head">' + field.label + '</div>' +
          '<div class="adm-card-field-body">' +
            '<div class="adm-row-2">' +
              '<div class="adm-field"><label class="adm-field-label">Name</label>' +
              '<input class="adm-field-input" data-card-part="name" type="text" value="' + esc(name) + '"></div>' +
              '<div class="adm-field"><label class="adm-field-label">Price</label>' +
              '<input class="adm-field-input" data-card-part="price" type="text" value="' + esc(price) + '"></div>' +
            '</div>' +
            '<div class="adm-field"><label class="adm-field-label">Tag (variant · color)</label>' +
            '<input class="adm-field-input" data-card-part="tag" type="text" value="' + esc(tag) + '"></div>' +
            '<div class="adm-field"><label class="adm-field-label">Description</label>' +
            '<input class="adm-field-input" data-card-part="desc" type="text" value="' + esc(desc) + '"></div>' +
          '</div></div>'
      );
    }
    var hint = field.hint
      ? '<span class="adm-field-hint">' + field.hint + '</span>'
      : '';
    if (field.type === 'textarea') {
      if (!hint) hint = '<span class="adm-field-hint">Markdown: *italic*, **bold**</span>';
      return (
        '<div class="adm-field">' +
          '<label class="adm-field-label" for="' + fid + '">' + field.label + '</label>' +
          '<textarea class="adm-field-textarea" id="' + fid + '" name="' + field.key + '" rows="3">' + esc(val || '') + '</textarea>' +
          hint +
        '</div>'
      );
    }
    return (
      '<div class="adm-field">' +
        '<label class="adm-field-label" for="' + fid + '">' + field.label + '</label>' +
        '<input class="adm-field-input" id="' + fid + '" name="' + field.key + '" type="text" value="' + esc(val || '') + '">' +
        hint +
      '</div>'
    );
  }

  function openPanel(secId) {
    var sec = getSec(secId);
    if (!sec) return;
    activeSection = secId;
    var vals = getValues(secId);
    panelTitle.textContent = sec.title;
    panelEdited.hidden = !(draft[secId] && Object.keys(draft[secId]).length > 0);
    panelBody.innerHTML = sec.fields.map(function (f) { return renderField(f, vals[f.key] || ''); }).join('');
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    frameOver.hidden = false;
    var first = panelBody.querySelector('input, textarea');
    if (first) setTimeout(function () { first.focus(); }, 80);
  }

  function closePanel() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    frameOver.hidden = true;
    activeSection = null;
  }

  function readPanelValues() {
    var sec = getSec(activeSection);
    if (!sec) return {};
    var out = {};
    sec.fields.forEach(function (f) {
      if (f.type === 'card') {
        var el = panelBody.querySelector('[data-card-key="' + f.key + '"]');
        if (!el) return;
        var name  = el.querySelector('[data-card-part="name"]').value.trim();
        var price = el.querySelector('[data-card-part="price"]').value.trim();
        var tag   = el.querySelector('[data-card-part="tag"]').value.trim();
        var desc  = el.querySelector('[data-card-part="desc"]').value.trim();
        out[f.key] = name + ' | ' + price + ' | ' + tag + '\n' + desc;
      } else {
        var fid   = 'adm-f-' + f.key.replace(/-/g, '_');
        var input = document.getElementById(fid) || panelBody.querySelector('[name="' + f.key + '"]');
        if (input) out[f.key] = input.value;
      }
    });
    return out;
  }

  function commitPanel() {
    if (!activeSection) return;
    draft[activeSection] = readPanelValues();
    saveScroll();
    closePanel();
    updateDirty();
    renderIframe();
  }

  function revertSection() {
    if (!activeSection) return;
    delete draft[activeSection];
    var sec  = getSec(activeSection);
    var vals = getValues(activeSection);
    panelBody.innerHTML = sec.fields.map(function (f) { return renderField(f, vals[f.key] || ''); }).join('');
    panelEdited.hidden = true;
    updateDirty();
    saveScroll();
    renderIframe();
  }

  // ── GitHub API ────────────────────────────────────────────────────────────

  function toB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin   = '';
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
        fetch('/index.html', { cache: 'no-cache' }),
      ]);
      var mdRes   = results[0];
      var siteRes = results[1];

      if (mdRes.status === 401 || mdRes.status === 403) {
        throw Object.assign(new Error('Token invalid or expired.'), { code: 'auth' });
      }
      if (!mdRes.ok) throw new Error('GitHub API returned HTTP ' + mdRes.status);

      var json     = await mdRes.json();
      fileSha      = json.sha;
      originalMd   = fromB64(json.content);
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
          sha: fileSha,
          branch: GITHUB_BRANCH,
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
        body: JSON.stringify({ ref: GITHUB_BRANCH, inputs: { target: 'staging' } }),
      });
      if (depRes.status === 401 || depRes.status === 403) {
        throw Object.assign(new Error('Token lacks Actions permission.'), { code: 'auth' });
      }
      if (depRes.status !== 204) throw new Error('Deploy trigger failed (HTTP ' + depRes.status + ').');

      draft = {};
      updateDirty();
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
    if (e.data && e.data.type === 'qc-edit') {
      saveScroll();
      openPanel(e.data.section);
    }
  });

  panelClose.addEventListener('click', closePanel);
  frameOver.addEventListener('click', closePanel);
  panelDone.addEventListener('click', commitPanel);
  panelRevert.addEventListener('click', revertSection);

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
