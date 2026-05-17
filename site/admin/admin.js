(function () {
  "use strict";

  const MARKED_CDN    = "https://cdn.jsdelivr.net/npm/marked@9/marked.min.js";
  const GITHUB_REPO   = "stevestribe/quinlynnAndCo";
  const GITHUB_BRANCH = "main";
  const CONTENT_API   = "https://api.github.com/repos/" + GITHUB_REPO + "/contents/site/content/pages/";

  const PAGES = [
    { id: "home", label: "Home", file: "home.md" },
  ];

  const CONTENT_BASE = "/content/pages/";
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

  // ── Preview builder ───────────────────────────────────────────────────────

  var PREVIEW_CSS = [
    "body{margin:0;background:var(--ivory);color:var(--charcoal);font-family:var(--sans);font-size:15px;line-height:1.65;}",
    ".sec{padding:2rem 2.5rem;border-bottom:1px solid var(--linen);}",
    ".sec:last-child{border-bottom:none}",
    ".sec-label{font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--sage-deep);margin-bottom:1.2rem;padding:.3rem .6rem;background:var(--linen);display:inline-block;border-radius:2px;}",
    // Hero
    ".hero-title{font-family:var(--serif);font-size:2rem;font-weight:400;line-height:1.2;margin:0;}",
    ".hero-title em{font-style:italic;color:var(--sage-deep);}",
    ".hero-sub{margin:.6rem 0 0;font-size:1rem;color:#5a5550;max-width:55ch;}",
    // About
    ".about-h{font-family:var(--serif);font-size:1.5rem;font-weight:400;margin:0 0 .8rem;}",
    ".about-h em{font-style:italic;}",
    ".about-body-txt{margin:.5rem 0;max-width:65ch;}",
    ".about-quote{margin:1rem 0;padding:.75rem 1.2rem;border-left:2px solid var(--sage-tint);font-family:var(--serif);font-style:italic;color:#5a5550;font-size:1rem;}",
    // Products
    ".prod-h{font-family:var(--serif);font-size:1.4rem;font-weight:400;margin:0 0 1.2rem;}",
    ".prod-h em{font-style:italic;}",
    ".cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.75rem;}",
    ".card{background:#fff;border:1px solid var(--linen);border-radius:4px;padding:.9rem;font-size:.82rem;}",
    ".card-ph{height:90px;background:var(--linen);border-radius:2px;margin-bottom:.6rem;display:flex;align-items:flex-end;padding:.4rem;}",
    ".card-ph span{font-size:.65rem;color:var(--taupe);letter-spacing:.04em;}",
    ".card-name{font-weight:600;color:var(--charcoal);}",
    ".card-price{color:var(--sage-deep);font-size:.8rem;margin:.15rem 0;}",
    ".card-desc{color:#777;margin:.2rem 0 0;font-size:.78rem;}",
    // Custom steps
    ".custom-lede{max-width:56ch;color:#5a5550;margin:.4rem 0 1.2rem;}",
    ".steps{display:flex;flex-direction:column;gap:1rem;}",
    ".step-item{display:flex;gap:.8rem;align-items:flex-start;}",
    ".step-num-badge{flex-shrink:0;width:2rem;height:2rem;border:1px solid var(--linen);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.65rem;letter-spacing:.06em;color:var(--sage-deep);font-weight:600;}",
    ".step-content{}",
    ".step-title-txt{font-weight:600;color:var(--charcoal);}",
    ".step-body-txt{font-size:.85rem;color:#5a5550;margin:.2rem 0 0;}",
    // Contact
    ".contact-h{font-family:var(--serif);font-size:1.5rem;font-weight:400;margin:0 0 .6rem;}",
    ".contact-h em{font-style:italic;}",
    ".contact-body-txt{max-width:55ch;color:#5a5550;}",
    // Footer
    ".footer-tag{color:#777;font-size:.85rem;max-width:44ch;margin:.3rem 0 0;}",
  ].join("");

  function renderHeroPreview(subs) {
    var title = mdInline(subs.title || "");
    var sub   = esc(subs.sub || "");
    return '<div class="sec">' +
      '<div class="sec-label">Hero</div>' +
      (title ? '<div class="hero-title">' + title + '</div>' : '') +
      (sub   ? '<div class="hero-sub">'   + sub   + '</div>' : '') +
      '</div>';
  }

  function renderAboutPreview(subs) {
    var heading = mdInline(subs.heading || "");
    var bio1    = esc(subs.bio1 || "");
    var quote   = esc(subs.quote || "");
    var bio2    = esc(subs.bio2 || "");
    return '<div class="sec">' +
      '<div class="sec-label">About</div>' +
      (heading ? '<div class="about-h">' + heading + '</div>' : '') +
      (bio1    ? '<p class="about-body-txt">' + bio1 + '</p>' : '') +
      (quote   ? '<blockquote class="about-quote">“' + quote + '”</blockquote>' : '') +
      (bio2    ? '<p class="about-body-txt">' + bio2 + '</p>' : '') +
      '</div>';
  }

  var CARD_COLORS = {
    card1: '#D4CABC', card2: '#C7D0C5', card3: '#EDE8E0',
    card4: '#C8BCB4', card5: '#A0A898', card6: '#D4CABC'
  };

  function renderProductsPreview(subs) {
    var heading = mdInline(subs.heading || "");
    var cards   = '';
    for (var i = 1; i <= 6; i++) {
      var text = subs['card' + i] || '';
      if (!text) continue;
      var lines  = text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var pieces = (lines[0] || '').split('|').map(function (p) { return p.trim(); });
      var name  = esc(pieces[0] || '');
      var price = esc(pieces[1] || '');
      var tag   = esc(pieces[2] || '');
      var desc  = esc(lines[1] || '');
      var bg    = CARD_COLORS['card' + i] || '#E9E3DA';
      cards += '<div class="card">' +
        '<div class="card-ph" style="background:' + bg + '"><span>' + tag + '</span></div>' +
        '<div class="card-name">' + name + '</div>' +
        '<div class="card-price">' + price + '</div>' +
        (desc ? '<div class="card-desc">' + desc + '</div>' : '') +
        '</div>';
    }
    return '<div class="sec">' +
      '<div class="sec-label">Products</div>' +
      (heading ? '<div class="prod-h">' + heading + '</div>' : '') +
      (cards   ? '<div class="cards">' + cards + '</div>' : '') +
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
      steps += '<div class="step-item">' +
        '<div class="step-num-badge">0' + i + '</div>' +
        '<div class="step-content">' +
          '<div class="step-title-txt">' + title + '</div>' +
          (body ? '<div class="step-body-txt">' + body + '</div>' : '') +
        '</div>' +
        '</div>';
    }
    return '<div class="sec">' +
      '<div class="sec-label">Custom Orders</div>' +
      (heading ? '<div class="about-h">' + heading + '</div>' : '') +
      (lede    ? '<p class="custom-lede">' + lede + '</p>' : '') +
      (steps   ? '<div class="steps">' + steps + '</div>' : '') +
      '</div>';
  }

  function renderContactPreview(subs) {
    var heading = mdInline(subs.heading || "");
    var body    = esc(subs.body || "");
    return '<div class="sec">' +
      '<div class="sec-label">Contact</div>' +
      (heading ? '<div class="contact-h">' + heading + '</div>' : '') +
      (body    ? '<p class="contact-body-txt">' + body + '</p>' : '') +
      '</div>';
  }

  function renderFooterPreview(subs) {
    var tagline = esc(subs.tagline || "");
    return '<div class="sec">' +
      '<div class="sec-label">Footer</div>' +
      (tagline ? '<p class="footer-tag">' + tagline + '</p>' : '') +
      '</div>';
  }

  function buildPreviewDoc(mdText) {
    var secs = parseContent(mdText);

    var notice = '<div style="background:var(--linen);padding:.4rem 1rem;font-size:.72rem;color:var(--taupe);border-bottom:1px solid var(--linen)">' +
      'Content preview &mdash; layout approximated. Changes appear on staging after publishing.</div>';

    var body = notice +
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

  // ── Load page ─────────────────────────────────────────────────────────────

  function loadPage(pageId) {
    var page = PAGES.find(function (p) { return p.id === pageId; });
    if (!page) return;
    currentPage = page; currentFrontmatter = "";
    editor.value = ""; editor.placeholder = "Loading…";
    setBusy(true); setStatus("Loading…");

    fetch(CONTENT_BASE + page.file, { cache: "no-cache" })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
      .then(function (text) {
        var parsed = splitFrontmatter(text);
        currentFrontmatter = parsed.frontmatter;
        editor.value = parsed.body;
        editor.placeholder = "";
        setStatus("Loaded", "is-ok");
        refreshPreview();
        clearStatusAfter(2000);
      })
      .catch(function (err) {
        editor.placeholder = "Could not load content file.";
        setStatus("Load failed: " + err.message, "is-err");
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

  async function doPublish(token) {
    if (!isEditorReady()) return;
    setBusy(true); setStatus("Publishing…");
    try {
      var sha = await getFileSha(currentPage.id, token);
      await commitFile(currentPage.id, fullContent(), sha, token);
      setStatus("Published! Staging rebuilds in ~2 min.", "is-ok");
      clearStatusAfter(12000);
    } catch (err) {
      if (err.code === "auth") { clearToken(); showTokenDialog("That token did not work: " + err.message); }
      else { setStatus("Publish failed: " + err.message, "is-err"); }
    } finally { setBusy(false); }
  }

  function handlePublishClick() {
    if (!isEditorReady()) return;
    var token = getToken();
    if (token) doPublish(token); else showTokenDialog();
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
    saveToken(token); tokenDialog.close(); doPublish(token);
  });
  tokenDialog.addEventListener("click", function (e) { if (e.target === tokenDialog) tokenDialog.close(); });

  // ── Init ──────────────────────────────────────────────────────────────────

  pageSelect.addEventListener("change", function () { loadPage(pageSelect.value); });
  editor.addEventListener("input", schedulePreview);
  downloadBtn.addEventListener("click", downloadFile);
  publishBtn.addEventListener("click", handlePublishClick);

  loadMarked(function () { loadPage(pageSelect.value); });
})();
