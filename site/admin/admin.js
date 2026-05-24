(function () {
  "use strict";

  const MARKED_CDN    = "https://cdn.jsdelivr.net/npm/marked@9/marked.min.js";
  const GITHUB_REPO   = "stevestribe/quinlynnAndCo";
  const GITHUB_BRANCH = "main";
  const CONTENT_API   = "https://api.github.com/repos/" + GITHUB_REPO + "/contents/site/content/pages/";

  const PAGES = [
    { id: "home", label: "Home", file: "home.md" },
  ];

  const TOKEN_KEY    = "admin_github_token";

  const pageSelect   = document.getElementById("page-select");
  const downloadBtn  = document.getElementById("download-btn");
  const publishBtn   = document.getElementById("publish-btn");
  const viewLiveBtn  = document.getElementById("view-live-btn");
  const statusMsg    = document.getElementById("status-msg");
  const editor       = document.getElementById("md-editor");
  const previewFrame = document.getElementById("preview-frame");
  const tokenDialog  = document.getElementById("token-dialog");
  const tokenForm    = document.getElementById("token-form");
  const tokenInput   = document.getElementById("token-input");
  const tokenError   = document.getElementById("token-error");
  const tokenCancel  = document.getElementById("token-cancel-btn");

  let currentPage        = null;
  let currentFrontmatter = "";
  let _afterToken        = null; // callback(token) run after token dialog submit
  let previewTimer       = null;

  // ── Button busy state ────────────────────────────────────────────────────

  function setBusy(isBusy) {
    [downloadBtn, publishBtn].forEach(function (btn) {
      if (isBusy) { btn.classList.add("is-busy"); btn.setAttribute("aria-disabled", "true"); }
      else         { btn.classList.remove("is-busy"); btn.removeAttribute("aria-disabled"); }
    });
  }

  function isEditorReady() {
    return currentPage !== null && editor.value.trim() !== "";
  }

  // ── Token ─────────────────────────────────────────────────────────────────

  function getToken()   { return sessionStorage.getItem(TOKEN_KEY) || ""; }
  function saveToken(t) { sessionStorage.setItem(TOKEN_KEY, t.trim()); }
  function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

  // ── Status ────────────────────────────────────────────────────────────────

  function setStatus(text, type) {
    statusMsg.textContent = text;
    statusMsg.className   = "admin-status" + (type ? " " + type : "");
  }

  function clearStatusAfter(ms) { setTimeout(function () { setStatus(""); }, ms); }

  // ── Frontmatter ───────────────────────────────────────────────────────────

  function splitFrontmatter(raw) {
    var m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (m) return { frontmatter: "---\n" + m[1] + "\n---\n", body: m[2] };
    return { frontmatter: "", body: raw };
  }

  function fullContent() { return currentFrontmatter + editor.value; }

  // ── marked.js ─────────────────────────────────────────────────────────────

  function loadMarked(onReady) {
    if (window.marked) { onReady(); return; }
    var s = document.createElement("script");
    s.src = MARKED_CDN;
    s.onload  = onReady;
    s.onerror = function () { setStatus("Preview unavailable (CDN unreachable).", "is-err"); onReady(); };
    document.head.appendChild(s);
  }

  // ── Content parser ────────────────────────────────────────────────────────

  function parseContent(text) {
    var out      = {};
    var secParts = text.split(/^## +/m);
    for (var i = 1; i < secParts.length; i++) {
      var lines   = secParts[i].split("\n");
      var secName = lines[0].trim().toLowerCase();
      var secBody = lines.slice(1).join("\n");
      out[secName] = {};
      var subParts = secBody.split(/^### +/m);
      for (var j = 1; j < subParts.length; j++) {
        var sLines  = subParts[j].split("\n");
        var subName = sLines[0].trim().toLowerCase();
        out[secName][subName] = sLines.slice(1).join("\n").trim();
      }
    }
    return out;
  }

  function mdInline(text) {
    if (!text) return "";
    if (window.marked) {
      var h = window.marked.parse(text.trim());
      return h.replace(/^<p>/, "").replace(/<\/p>\s*$/, "");
    }
    return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
               .replace(/\*(.+?)\*/g,     "<em>$1</em>");
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── SVGs (match build-site.py constants) ─────────────────────────────────

  var ARROW_SVG = '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16h20M19 9l7 7-7 7" /></svg>';

  var STEP_SVGS = [
    '<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="9" width="22" height="15" rx="0.5" /><path d="M5 10l11 8 11-8" /></svg>',
    '<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="16" rx="0.5" /><rect x="12" y="13" width="16" height="12" rx="0.5" /></svg>',
    '<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12h18l-1.5 14.5a1 1 0 0 1-1 .9H9.5a1 1 0 0 1-1-.9L7 12z" /><path d="M11 12V9a5 5 0 0 1 10 0v3" /></svg>',
  ];

  var CARD_PH_CLASSES = ['warm', 'sage', '', 'taupe', 'deep', 'warm'];

  // ── Preview CSS (minimal overrides on top of /css/styles.css) ────────────

  var PREVIEW_CSS = [
    "body{margin:0;overflow-x:hidden;}",
    // Section wrapper + label chip
    ".psec{padding:2rem 2.5rem;border-bottom:1px solid var(--hairline-soft);}",
    ".psec:last-child{border-bottom:none;}",
    ".sec-label{display:inline-block;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:var(--sage-deep);margin-bottom:1.25rem;padding:.25rem .6rem;background:var(--linen);border-radius:2px;}",
    // em in section headings — about uses its own rule in styles.css; others need this
    ".h-section em{font-style:italic;color:var(--sage-deep);}",
    // Hero frame (approximates full-bleed hero)
    ".phero-bg{background:#F1EEE8;padding:1.5rem;margin-top:.5rem;}",
    ".phero-frame{background:#FCFAF6;padding:2rem 2.5rem;display:flex;flex-direction:column;align-items:center;text-align:center;gap:.75rem;box-shadow:0 8px 40px rgba(58,53,44,.05);}",
    // Products: grid instead of horizontal scroll carousel
    ".ppreview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:1rem;}",
    // Notice bar
    ".preview-notice{background:var(--linen);padding:.35rem 1rem;font-family:var(--mono);font-size:.68rem;color:var(--taupe);border-bottom:1px solid var(--hairline-soft);}",
  ].join("");

  // ── Preview builder ───────────────────────────────────────────────────────

  function renderLabelsPreview(subs) {
    var rows = [
      ['Nav · About section', subs.about    || '<em>not set</em>'],
      ['Nav · Products section', subs.products || '<em>not set</em>'],
      ['Nav · Contact section', subs.contact  || '<em>not set</em>'],
    ];
    var rowsHtml = rows.map(function (r) {
      return '<tr><td style="padding:4px 16px 4px 0;opacity:.6">' + r[0] + '</td>' +
             '<td style="font-weight:600">' + esc(r[1]).replace('&lt;em&gt;', '<em>').replace('&lt;/em&gt;', '</em>') + '</td></tr>';
    }).join('');
    return '<div class="psec">' +
      '<div class="sec-label">Labels</div>' +
      '<table style="font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;border-collapse:collapse">' +
      rowsHtml + '</table>' +
      '</div>';
  }

  function renderHeroPreview(subs) {
    var title = mdInline(subs.title || "");
    var sub   = esc(subs.sub || "");
    return '<div class="psec">' +
      '<div class="sec-label">Hero</div>' +
      '<div class="phero-bg"><div class="phero-frame">' +
      (title ? '<h1 class="h-display hero-title">' + title + '</h1>' : '') +
      (sub   ? '<p class="lede hero-sub" style="margin:0;max-width:48ch;">' + sub + '</p>' : '') +
      '</div></div>' +
      '</div>';
  }

  function renderAboutPreview(subs) {
    var heading = mdInline(subs.heading || "");
    var bio1    = esc(subs.bio1 || "");
    var quote   = esc(subs.quote || "");
    var bio2    = esc(subs.bio2 || "");
    var sign    = esc(subs.sign || "");
    var metaLines = (subs.meta || "").split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var metaHtml = metaLines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    return '<div class="psec">' +
      '<div class="sec-label">About</div>' +
      '<div class="about-body" style="max-width:100%">' +
      (heading  ? '<h2 class="h-section">' + heading + '</h2>' : '') +
      (bio1     ? '<p class="body">' + bio1 + '</p>' : '') +
      (quote    ? '<blockquote class="about-quote">&ldquo;' + quote + '&rdquo;</blockquote>' : '') +
      (bio2     ? '<p class="body">' + bio2 + '</p>' : '') +
      (sign     ? '<div class="about-sign">' + sign + '</div>' : '') +
      (metaHtml ? '<div class="about-aside-meta" style="margin-top:.5rem">' + metaHtml + '</div>' : '') +
      '</div>' +
      '</div>';
  }

  function renderProductsPreview(subs) {
    var heading = mdInline(subs.heading || "");
    var cards   = '';
    for (var i = 1; i <= 6; i++) {
      var text = subs['card' + i] || '';
      if (!text) continue;
      var lines  = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var pieces = (lines[0] || '').split('|').map(function (p) { return p.trim(); });
      var name   = esc(pieces[0] || '');
      var price  = esc(pieces[1] || '');
      var tag    = esc(pieces[2] || '');
      var desc   = esc(lines[1] || '');
      var phCls  = 'ph' + (CARD_PH_CLASSES[i - 1] ? ' ' + CARD_PH_CLASSES[i - 1] : '') + ' inner';
      cards += '<a class="pcard" href="#" onclick="return false">' +
        '<div class="pcard-img"><div class="' + phCls + '">' +
        (tag ? '<span class="ph-tag">' + tag + '</span>' : '') +
        '</div></div>' +
        '<div class="pcard-meta">' +
        '<div class="pcard-name">' + name + '</div>' +
        '<div class="pcard-price">' + price + '</div>' +
        (desc ? '<p class="pcard-desc">' + desc + '</p>' : '') +
        '<span class="pcard-cta">View on Etsy ' + ARROW_SVG + '</span>' +
        '</div>' +
        '</a>';
    }
    return '<div class="psec">' +
      '<div class="sec-label">Products</div>' +
      (heading ? '<h2 class="h-section" style="margin-bottom:0">' + heading + '</h2>' : '') +
      (cards ? '<div class="ppreview-grid">' + cards + '</div>' : '') +
      '</div>';
  }

  function renderCustomPreview(subs) {
    var heading = mdInline(subs.heading || "");
    var lede    = esc(subs.lede || "");
    var steps   = '';
    for (var i = 1; i <= 3; i++) {
      var text  = subs['step' + i] || '';
      if (!text) continue;
      var lines = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var title = esc(lines[0] || '');
      var body  = esc(lines.slice(1).join(' '));
      var svg   = STEP_SVGS[i - 1] || '';
      steps += '<div class="step">' +
        '<div class="step-top">' +
        '<span class="step-num">Step 0' + i + '</span>' +
        '<span class="step-icon" aria-hidden="true">' + svg + '</span>' +
        '</div>' +
        '<div class="step-title">' + title + '</div>' +
        (body ? '<p class="step-body">' + body + '</p>' : '') +
        '</div>';
    }
    return '<div class="psec">' +
      '<div class="sec-label">Custom Orders</div>' +
      '<div style="text-align:center;margin-bottom:1.5rem">' +
      (heading ? '<h2 class="h-section">' + heading + '</h2>' : '') +
      (lede ? '<p class="lede" style="max-width:56ch;margin:.75rem auto 0">' + lede + '</p>' : '') +
      '</div>' +
      (steps ? '<div class="cust-grid">' + steps + '</div>' : '') +
      '</div>';
  }

  function renderContactPreview(subs) {
    var heading = mdInline(subs.heading || "");
    var body    = esc(subs.body || "");
    return '<div class="psec">' +
      '<div class="sec-label">Contact</div>' +
      '<div style="max-width:380px">' +
      (heading ? '<h2 class="h-section">' + heading + '</h2>' : '') +
      (body    ? '<p class="body" style="margin-top:.75rem">' + body + '</p>' : '') +
      '</div>' +
      '</div>';
  }

  function renderFooterPreview(subs) {
    var tagline = esc(subs.tagline || "");
    return '<div class="psec">' +
      '<div class="sec-label">Footer</div>' +
      (tagline ? '<p class="ft-tag" style="margin:0 auto;text-align:center">' + tagline + '</p>' : '') +
      '</div>';
  }

  function buildPreviewDoc(mdText) {
    var secs = parseContent(mdText);

    var notice = '<div class="preview-notice">Content preview — layout approximated. Changes appear on staging after publishing.</div>';

    var body = notice +
      renderLabelsPreview(secs.labels || {}) +
      renderHeroPreview(secs.hero || {}) +
      renderAboutPreview(secs.about || {}) +
      renderProductsPreview(secs.products || {}) +
      renderCustomPreview(secs.custom || {}) +
      renderContactPreview(secs.contact || {}) +
      renderFooterPreview(secs.footer || {});

    return '<!doctype html><html lang="en"><head>' +
      '<meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Manrope:wght@300;400;500;600&display=swap">' +
      '<link rel="stylesheet" href="/css/styles.css">' +
      '<style>' + PREVIEW_CSS + '</style>' +
      '</head><body data-density="compact">' + body + '</body></html>';
  }

  function refreshPreview() { previewFrame.srcdoc = buildPreviewDoc(editor.value); }
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(refreshPreview, 300); }

  // ── Load page (reads from GitHub API — avoids server file-serving issues) ──

  function loadPage(pageId) {
    var page = PAGES.find(function (p) { return p.id === pageId; });
    if (!page) return;
    currentPage = page; currentFrontmatter = "";
    editor.value = ""; editor.placeholder = "Loading…";
    setBusy(true); setStatus("Loading…");

    var token   = getToken();
    var headers = { "Accept": "application/vnd.github.v3+json" };
    if (token) headers["Authorization"] = "token " + token;

    fetch(CONTENT_API + page.file, { headers: headers, cache: "no-cache" })
      .then(function (res) {
        if (res.status === 401 || res.status === 403)
          throw Object.assign(new Error("A GitHub token is needed to load this content."), { code: "auth" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        var raw    = json.content.replace(/\n/g, "");
        var bytes  = Uint8Array.from(atob(raw), function (c) { return c.charCodeAt(0); });
        var text   = new TextDecoder("utf-8").decode(bytes);
        var parsed = splitFrontmatter(text);
        currentFrontmatter = parsed.frontmatter;
        editor.value = parsed.body;
        editor.placeholder = "";
        setStatus("Loaded", "is-ok");
        refreshPreview();
        clearStatusAfter(2000);
      })
      .catch(function (err) {
        if (err.code === "auth") {
          clearToken();
          // _afterToken is null → tokenForm submit will re-call loadPage
          showTokenDialog(err.message);
        } else {
          editor.placeholder = "Could not load content file.";
          setStatus("Load failed: " + err.message, "is-err");
        }
      })
      .finally(function () { setBusy(false); });
  }

  // ── Download ──────────────────────────────────────────────────────────────

  function downloadFile() {
    if (!isEditorReady()) return;
    var blob = new Blob([fullContent()], { type: "text/markdown;charset=utf-8" });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href = url; a.download = currentPage.file;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    setStatus("Downloaded.", "is-ok"); clearStatusAfter(3000);
  }

  // ── GitHub helpers ────────────────────────────────────────────────────────

  function toBase64Utf8(str) {
    var bytes = new TextEncoder().encode(str); var bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function ghHeaders(token) {
    return { "Authorization": "token " + token,
             "Accept": "application/vnd.github.v3+json",
             "Content-Type": "application/json" };
  }

  async function getFileSha(slug, token) {
    var res = await fetch(CONTENT_API + slug + ".md", { headers: ghHeaders(token) });
    if (res.status === 401 || res.status === 403)
      throw Object.assign(new Error("Token invalid or lacks write permission."), { code: "auth" });
    if (!res.ok) throw new Error("Could not read file metadata (HTTP " + res.status + ").");
    return (await res.json()).sha;
  }

  async function commitFile(slug, content, sha, token) {
    var res = await fetch(CONTENT_API + slug + ".md", {
      method: "PUT", headers: ghHeaders(token),
      body: JSON.stringify({ message: "Update " + slug + " page content via staging editor",
                             content: toBase64Utf8(content), sha: sha, branch: GITHUB_BRANCH }),
    });
    if (res.status === 401 || res.status === 403)
      throw Object.assign(new Error("Token invalid or lacks write permission."), { code: "auth" });
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      throw new Error(body.message || "Commit failed (HTTP " + res.status + ").");
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  async function triggerDeploy(token) {
    var res = await fetch(
      "https://api.github.com/repos/" + GITHUB_REPO + "/actions/workflows/deploy-staging.yml/dispatches",
      {
        method: "POST",
        headers: ghHeaders(token),
        body: JSON.stringify({ ref: GITHUB_BRANCH, inputs: { target: "staging" } }),
      }
    );
    if (res.status === 401 || res.status === 403)
      throw Object.assign(new Error("Token lacks Actions permission."), { code: "auth" });
    if (res.status !== 204)
      throw new Error("Deploy trigger failed (HTTP " + res.status + ").");
  }

  async function doPublish(token) {
    if (!isEditorReady()) return;
    setBusy(true); setStatus("Publishing…");
    try {
      var sha = await getFileSha(currentPage.id, token);
      await commitFile(currentPage.id, fullContent(), sha, token);
      setStatus("Saved — triggering staging deploy…");
      await triggerDeploy(token);
      setStatus("Published! Staging rebuilds in ~30 sec.", "is-ok");
      clearStatusAfter(12000);
    } catch (err) {
      if (err.code === "auth") { clearToken(); _afterToken = function (t) { doPublish(t); }; showTokenDialog("That token did not work: " + err.message); }
      else { setStatus("Publish failed: " + err.message, "is-err"); }
    } finally { setBusy(false); }
  }

  function handlePublishClick() {
    if (!isEditorReady()) return;
    var token = getToken();
    if (token) { doPublish(token); return; }
    _afterToken = function (t) { doPublish(t); };
    showTokenDialog();
  }

  // ── Token dialog ──────────────────────────────────────────────────────────

  function showTokenDialog(errorMessage) {
    tokenInput.value = ""; tokenError.hidden = !errorMessage;
    if (errorMessage) tokenError.textContent = errorMessage;
    tokenDialog.showModal(); setTimeout(function () { tokenInput.focus(); }, 50);
  }

  tokenCancel.addEventListener("click", function () { tokenDialog.close(); });
  tokenForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var token = tokenInput.value.trim();
    if (!token) { tokenError.textContent = "Please enter a token."; tokenError.hidden = false; tokenInput.focus(); return; }
    saveToken(token); tokenDialog.close();
    var fn = _afterToken; _afterToken = null;
    if (fn) fn(token); else loadPage(currentPage ? currentPage.id : pageSelect.value);
  });
  tokenDialog.addEventListener("click", function (e) { if (e.target === tokenDialog) tokenDialog.close(); });

  // ── Init — decouple content load from marked.js CDN ──────────────────────

  pageSelect.addEventListener("change", function () { loadPage(pageSelect.value); });
  editor.addEventListener("input", schedulePreview);
  downloadBtn.addEventListener("click", downloadFile);
  publishBtn.addEventListener("click", handlePublishClick);

  loadPage(pageSelect.value);
  loadMarked(function () { if (editor.value.trim()) refreshPreview(); });
})();
