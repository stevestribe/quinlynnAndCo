// ── Scroll reveal ────────────────────────────────────────────────────
(function () {
  var items = document.querySelectorAll('.reveal');
  if (!items.length || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  items.forEach(function (el) { io.observe(el); });
})();

// ── Nav scroll + sticky CTA ──────────────────────────────────────────
(function () {
  var nav = document.getElementById('site-nav');
  var cta = document.getElementById('sticky-cta');

  function onScroll() {
    var y = window.scrollY;
    if (nav) nav.classList.toggle('is-scrolled', y > 24);
    if (cta) cta.classList.toggle('in', y > window.innerHeight * 0.9);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// ── Smooth scroll for all anchor links ───────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(function (link) {
  link.addEventListener('click', function (e) {
    var id = this.getAttribute('href').slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// ── Mobile drawer ────────────────────────────────────────────────────
(function () {
  var drawer  = document.getElementById('drawer');
  var openBtn = document.getElementById('menu-open');
  var closeBtn = document.getElementById('menu-close');
  if (!drawer || !openBtn || !closeBtn) return;

  function open() {
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    openBtn.focus();
  }

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  drawer.querySelectorAll('.drawer-link, .drawer-foot .btn').forEach(function (el) {
    el.addEventListener('click', close);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
  });
})();

// ── Hero subtle parallax ─────────────────────────────────────────────
(function () {
  var frame = document.getElementById('hero-frame');
  if (!frame) return;

  var raf;
  window.addEventListener('scroll', function () {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      var y = Math.max(-window.innerHeight, Math.min(window.scrollY, window.innerHeight));
      frame.style.transform = 'translateY(' + (y * 0.02) + 'px)';
    });
  }, { passive: true });
})();

// ── Products carousel ────────────────────────────────────────────────
(function () {
  var track     = document.getElementById('prod-track');
  var prevBtn   = document.getElementById('prod-prev');
  var nextBtn   = document.getElementById('prod-next');
  var dotsWrap  = document.getElementById('prod-dots');
  if (!track || !prevBtn || !nextBtn || !dotsWrap) return;

  var TOTAL = track.querySelectorAll('.pcard').length;
  var idx = 0;

  function perView() {
    var w = window.innerWidth;
    return w < 640 ? 1 : w < 1024 ? 2 : 3;
  }
  function maxIdx() { return Math.max(0, TOTAL - perView()); }

  function buildDots() {
    var count = maxIdx() + 1;
    dotsWrap.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('span');
      dot.className = 'prod-dot' + (i === idx ? ' is-active' : '');
      dotsWrap.appendChild(dot);
    }
  }

  function updateDots() {
    dotsWrap.querySelectorAll('.prod-dot').forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === idx);
    });
  }

  function updateButtons() {
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx >= maxIdx();
  }

  function scrollTo(i) {
    var clamped = Math.max(0, Math.min(i, maxIdx()));
    idx = clamped;
    var card = track.querySelector('.pcard');
    if (!card) return;
    var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    var step = card.getBoundingClientRect().width + gap;
    track.scrollTo({ left: step * clamped, behavior: 'smooth' });
    updateButtons();
    updateDots();
  }

  track.addEventListener('scroll', function () {
    var card = track.querySelector('.pcard');
    if (!card) return;
    var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    var step = card.getBoundingClientRect().width + gap;
    var i = Math.round(track.scrollLeft / step);
    if (i !== idx) { idx = i; updateButtons(); updateDots(); }
  }, { passive: true });

  prevBtn.addEventListener('click', function () { scrollTo(idx - 1); });
  nextBtn.addEventListener('click', function () { scrollTo(idx + 1); });

  window.addEventListener('resize', function () { buildDots(); updateButtons(); });

  buildDots();
  updateButtons();
})();

// ── Inquire form (notecard + flip on submit) ─────────────────────────
// Replaces the previous "Contact form" IIFE at the bottom of main.js.
// Plain vanilla JS — no framework. Hooks into elements by id.
(function () {
  var form        = document.getElementById('inquiry-form');
  if (!form) return;

  var flipInner   = document.getElementById('inq-flip');
  var summary     = document.getElementById('err-summary');
  var summaryBold = summary && summary.querySelector('b');
  var submitBtn   = document.getElementById('submit-btn');
  var submitLabel = submitBtn && submitBtn.querySelector('.btn-label');
  var submitRow   = document.getElementById('submit-row');
  var fileInput   = document.getElementById('f-file');
  var fileLabel   = document.getElementById('f-file-label');
  var fileNameEl  = document.getElementById('file-name');
  var sendAnother = document.getElementById('send-another');
  var stampEl     = document.getElementById('inq-stamp');

  // ── Date stamp in the masthead ("May 2026") ────────────────────
  if (stampEl) {
    try {
      stampEl.textContent = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
    } catch (e) {
      stampEl.textContent = '';
    }
  }

  // ── Field config — single source of truth for keys + labels ───
  // FIELD_ORDER is visual order in the form (top → bottom). The
  // validation summary lists missing fields in this order so the
  // eye can scan from the alert down to the first offender.
  var FIELDS = [
    { key: 'interest', id: 'f-interest', label: "what you'd like made" },
    { key: 'details',  id: 'f-details',  label: 'a few details about it' },
    { key: 'email',    id: 'f-email',    label: 'your email' }, // becomes "a valid email" when filled but malformed
    { key: 'name',     id: 'f-name',     label: 'your name' }
  ];

  var touched   = {};
  var attempted = false;
  var status    = 'idle'; // idle | submitting | done

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  // Returns an errs object: { key: friendly-label } for every missing/invalid field.
  function validate() {
    var errs = {};
    var interest = val('f-interest');
    var details  = val('f-details').trim();
    var email    = val('f-email').trim();
    var name     = val('f-name').trim();

    if (!interest)                       errs.interest = "what you'd like made";
    if (!details || details.length < 12) errs.details  = 'a few details about it';
    if (!email)                          errs.email    = 'your email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'a valid email';
    if (!name)                           errs.name     = 'your name';
    return errs;
  }

  // Grammatical list join:
  //   ["a"]            → "a"
  //   ["a","b"]        → "a and b"
  //   ["a","b","c"]    → "a, b, and c"  (Oxford comma)
  function joinList(items) {
    if (items.length <= 1) return items[0] || '';
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  // Per-field underline + summary update.
  function render() {
    var errs = validate();

    // Per-field tint (.err class). Show on blur once the user has
    // touched that field, OR after they've attempted a submit.
    FIELDS.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      var show = (touched[f.key] || attempted) && !!errs[f.key];
      el.classList.toggle('err', show);
    });

    // Validation summary — ONLY after first submit attempt.
    if (!attempted) {
      if (summary) summary.hidden = true;
      return;
    }
    var labels = FIELDS.filter(function (f) { return !!errs[f.key]; })
                       .map(function (f) { return errs[f.key]; });
    if (labels.length === 0) {
      if (summary) summary.hidden = true;
    } else {
      if (summary) {
        summary.hidden = false;
        if (summaryBold) summaryBold.textContent = joinList(labels);
      }
    }
  }

  // ── Per-field wiring (blur + input) ────────────────────────────
  FIELDS.forEach(function (f) {
    var el = document.getElementById(f.id);
    if (!el) return;
    el.addEventListener('blur', function () {
      touched[f.key] = true;
      render();
    });
    el.addEventListener('input', function () {
      // Re-validate as they type — but only adjust UI for already-touched fields.
      if (touched[f.key] || attempted) render();
    });
    // For <select>, also catch the change event so the underline updates immediately
    if (el.tagName === 'SELECT') {
      el.addEventListener('change', function () { touched[f.key] = true; render(); });
    }
  });

  // ── File picker — update the label + filename ─────────────────
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (f) {
        if (fileLabel) fileLabel.textContent = 'Change reference image';
        if (fileNameEl) { fileNameEl.textContent = f.name; fileNameEl.hidden = false; }
      } else {
        if (fileLabel) fileLabel.textContent = 'Attach a reference image';
        if (fileNameEl) { fileNameEl.textContent = ''; fileNameEl.hidden = true; }
      }
    });
  }

  // ── Reset to a blank note (called by "Send another" link) ─────
  function reset() {
    status    = 'idle';
    attempted = false;
    touched   = {};
    form.reset();
    render();
    // File picker label reset
    if (fileLabel) fileLabel.textContent = 'Attach a reference image';
    if (fileNameEl) { fileNameEl.textContent = ''; fileNameEl.hidden = true; }
    // Submit button reset
    if (submitBtn) submitBtn.disabled = false;
    if (submitLabel) submitLabel.textContent = 'Send the note';
    // Flip back
    if (flipInner) flipInner.classList.remove('is-flipped');
    // A11y: re-enable the send-another link's tabindex once flipped back
    if (sendAnother) sendAnother.tabIndex = -1;
    // Re-enable the front pane's interactive elements
    setFrontInteractive(true);
  }

  // Pointer/focus lock for the front face once flipped.
  function setFrontInteractive(on) {
    var nodes = form.querySelectorAll('input, select, textarea, button, a');
    nodes.forEach(function (n) {
      if (on) {
        n.removeAttribute('tabindex');
      } else {
        n.setAttribute('tabindex', '-1');
      }
    });
  }

  // ── Submit handler ────────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    attempted = true;
    var errs = validate();
    render();
    if (Object.keys(errs).length > 0) return;

    status = 'submitting';
    if (submitBtn) submitBtn.disabled = true;
    if (submitLabel) submitLabel.textContent = 'Sending…';

    // TODO: replace this setTimeout with a real form endpoint
    //       (Resend, Formspree, Netlify Function, etc.). The success
    //       branch below is what should run on a 2xx response.
    setTimeout(function () {
      status = 'done';
      if (flipInner) flipInner.classList.add('is-flipped');
      // Lock the front so it can't be tabbed into behind the card
      setFrontInteractive(false);
      // The Send another link becomes focusable now
      if (sendAnother) sendAnother.tabIndex = 0;
    }, 900);
  });

  // ── "Send another" → reset + flip back ────────────────────────
  if (sendAnother) {
    sendAnother.addEventListener('click', function (e) {
      e.preventDefault();
      reset();
    });
  }

  // ── Sticky-CTA visibility toggle (preserved behaviour) ────────
  // When the submit row is on-screen, hide the floating "Start a Custom
  // Order" pill so it doesn't overlap the form.
  if (submitRow && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      document.body.dataset.contactVisible = entries[0].isIntersecting ? '1' : '0';
    }, { threshold: 0.01 });
    io.observe(submitRow);
  }
})();
