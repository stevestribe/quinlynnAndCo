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
      if (isBusy) {
        btn.classList.add("is-busy");
        btn.setAttribute("aria-disabled", "true");
      } else {
        btn.classList.remove("is-busy");
        btn.removeAttribute("aria-disabled");
      }
    });
  }

  function isEditorReady() {
    return currentPage !== null && editor.value.trim() !== "";
  }

  // ── Token (sessionStorage) ───────────────────────────────────────────────

  function getToken()       { return sessionStorage.getItem(TOKEN_KEY) || ""; }
  function saveToken(t)     { sessionStorage.setItem(TOKEN_KEY, t.trim()); }
  function clearToken()     { sessionStorage.removeItem(TOKEN_KEY); }

  // ── Status ───────────────────────────────────────────────────────────────

  function setStatus(text, type) {
    statusMsg.textContent = text;
    statusMsg.className   = "admin-status" + (type ? " " + type : "");
  }

  function clearStatusAfter(ms) {
    setTimeout(function () { setStatus(""); }, ms);
  }

  // ── Frontmatter ──────────────────────────────────────────────────────────

  function splitFrontmatter(raw) {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (m) return { frontmatter: "---\n" + m[1] + "\n---\n", body: m[2] };
    return { frontmatter: "", body: raw };
  }

  function fullContent() { return currentFrontmatter + editor.value; }

  // ── marked.js ────────────────────────────────────────────────────────────

  function loadMarked(onReady) {
    if (window.marked) { onReady(); return; }
    const s    = document.createElement("script");
    s.src      = MARKED_CDN;
    s.onload   = onReady;
    s.onerror  = function () {
      setStatus("Markdown preview unavailable (CDN unreachable).", "is-err");
      onReady();
    };
    document.head.appendChild(s);
  }

  // ── Preview ──────────────────────────────────────────────────────────────

  function buildPreviewDoc(mdText) {
    var rendered = (window.marked && mdText.trim())
      ? window.marked.parse(mdText)
      : "<p><em>Start editing to see a preview.</em></p>";

    return "<!doctype html><html lang=\"en\"><head>" +
      "<meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">" +
      "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Manrope:wght@300;400;500;600&display=swap\">" +
      "<link rel=\"stylesheet\" href=\"/css/styles.css\">" +
      "<style>" +
        "body{padding:clamp(1.5rem,4vw,3rem) clamp(1rem,4vw,2.5rem);background:var(--ivory)}" +
        "h1,h2{font-family:var(--serif);margin-top:2rem}" +
        "h3{margin-top:1.5rem;font-size:.95rem;letter-spacing:.06em;text-transform:uppercase;font-family:var(--sans);font-weight:600;color:var(--sage-deep)}" +
        "p{margin-top:.6rem;max-width:66ch}" +
        "blockquote{margin:1rem 0;padding:.75rem 1.2rem;border-left:2px solid var(--sage-tint);font-family:var(--serif);font-style:italic;color:#555}" +
        "hr{border:none;border-top:1px solid var(--linen);margin:1.5rem 0}" +
        ".preview-notice{background:var(--linen);border-radius:4px;padding:.45rem .9rem;font-size:.75rem;color:var(--taupe);margin-bottom:1.5rem}" +
      "</style>" +
      "</head><body data-density=\"compact\">" +
      "<p class=\"preview-notice\">Content preview — section headings (## and ###) are structural markers, not displayed on the live site.</p>" +
      rendered +
      "</body></html>";
  }

  function refreshPreview() {
    previewFrame.srcdoc = buildPreviewDoc(editor.value);
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 280);
  }

  // ── Load page ────────────────────────────────────────────────────────────

  function loadPage(pageId) {
    const page = PAGES.find(function (p) { return p.id === pageId; });
    if (!page) return;

    currentPage        = page;
    currentFrontmatter = "";
    editor.value       = "";
    editor.placeholder = "Loading…";
    setBusy(true);
    setStatus("Loading…");

    fetch(CONTENT_BASE + page.file, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        const parsed       = splitFrontmatter(text);
        currentFrontmatter = parsed.frontmatter;
        editor.value       = parsed.body;
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

  // ── Download ─────────────────────────────────────────────────────────────

  function downloadFile() {
    if (!isEditorReady()) return;
    const blob = new Blob([fullContent()], { type: "text/markdown;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = currentPage.file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("Downloaded.", "is-ok");
    clearStatusAfter(3000);
  }

  // ── GitHub helpers ────────────────────────────────────────────────────────

  function toBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary  = "";
    bytes.forEach(function (b) { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function ghHeaders(token) {
    return {
      "Authorization": "token " + token,
      "Accept":        "application/vnd.github.v3+json",
      "Content-Type":  "application/json",
    };
  }

  async function getFileSha(slug, token) {
    const res = await fetch(CONTENT_API + slug + ".md", { headers: ghHeaders(token) });
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error("Token invalid or lacks write permission."), { code: "auth" });
    }
    if (!res.ok) throw new Error("Could not read file metadata (HTTP " + res.status + ").");
    const data = await res.json();
    return data.sha;
  }

  async function commitFile(slug, content, sha, token) {
    const res = await fetch(CONTENT_API + slug + ".md", {
      method:  "PUT",
      headers: ghHeaders(token),
      body:    JSON.stringify({
        message: "Update " + slug + " page content via staging editor",
        content: toBase64Utf8(content),
        sha:     sha,
        branch:  GITHUB_BRANCH,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      throw Object.assign(new Error("Token invalid or lacks write permission."), { code: "auth" });
    }
    if (!res.ok) {
      const body = await res.json().catch(function () { return {}; });
      throw new Error(body.message || "Commit failed (HTTP " + res.status + ").");
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  async function doPublish(token) {
    if (!isEditorReady()) return;
    setBusy(true);
    setStatus("Publishing…");
    try {
      const sha = await getFileSha(currentPage.id, token);
      await commitFile(currentPage.id, fullContent(), sha, token);
      setStatus("Published! Staging rebuilds in ~2 min.", "is-ok");
      clearStatusAfter(12000);
    } catch (err) {
      if (err.code === "auth") {
        clearToken();
        showTokenDialog("That token did not work: " + err.message);
      } else {
        setStatus("Publish failed: " + err.message, "is-err");
      }
    } finally {
      setBusy(false);
    }
  }

  function handlePublishClick() {
    if (!isEditorReady()) return;
    const token = getToken();
    if (token) { doPublish(token); } else { showTokenDialog(); }
  }

  // ── Token dialog ──────────────────────────────────────────────────────────

  function showTokenDialog(errorMessage) {
    tokenInput.value  = "";
    tokenError.hidden = !errorMessage;
    if (errorMessage) tokenError.textContent = errorMessage;
    tokenDialog.showModal();
    setTimeout(function () { tokenInput.focus(); }, 50);
  }

  tokenCancel.addEventListener("click", function () { tokenDialog.close(); });

  tokenForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const token = tokenInput.value.trim();
    if (!token) {
      tokenError.textContent = "Please enter a token.";
      tokenError.hidden      = false;
      tokenInput.focus();
      return;
    }
    saveToken(token);
    tokenDialog.close();
    doPublish(token);
  });

  tokenDialog.addEventListener("click", function (e) {
    if (e.target === tokenDialog) tokenDialog.close();
  });

  // ── Init ──────────────────────────────────────────────────────────────────

  pageSelect.addEventListener("change", function () { loadPage(pageSelect.value); });
  editor.addEventListener("input", schedulePreview);
  downloadBtn.addEventListener("click", downloadFile);
  publishBtn.addEventListener("click", handlePublishClick);

  loadMarked(function () { loadPage(pageSelect.value); });
})();
