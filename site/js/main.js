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

// ── Contact form ─────────────────────────────────────────────────────
(function () {
  var form       = document.getElementById('inquiry-form');
  var formWrap   = document.getElementById('form-wrap');
  var successEl  = document.getElementById('form-success');
  var submitBtn  = document.getElementById('submit-btn');
  var submitRow  = document.getElementById('submit-row');
  var fileInput  = document.getElementById('f-file');
  var fileNameEl = document.getElementById('file-name');
  var sendAnother = document.getElementById('send-another');
  if (!form) return;

  var touched = {};

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function validate() {
    var errs = {};
    var name    = val('f-name').trim();
    var email   = val('f-email').trim();
    var interest = val('f-interest');
    var details = val('f-details').trim();

    if (!name) errs.name = 'Please share your name.';
    if (!email) errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "That doesn't look like an email.";
    if (!interest) errs.interest = 'Pick the closest match.';
    if (!details || details.length < 12) errs.details = 'A few sentences helps — at least 12 characters.';
    return errs;
  }

  function showErrs(errs, showAll) {
    ['name', 'email', 'interest', 'details'].forEach(function (k) {
      var fieldEl = form.querySelector('[data-field="' + k + '"]');
      if (!fieldEl) return;
      var errMsg = fieldEl.querySelector('.err-msg');
      var show = (showAll || touched[k]) && errs[k];
      fieldEl.classList.toggle('err', !!show);
      if (errMsg) errMsg.textContent = errs[k] || '';
    });
  }

  function clearErrs() {
    ['name', 'email', 'interest', 'details'].forEach(function (k) {
      var fieldEl = form.querySelector('[data-field="' + k + '"]');
      if (!fieldEl) return;
      fieldEl.classList.remove('err');
      var errMsg = fieldEl.querySelector('.err-msg');
      if (errMsg) errMsg.textContent = '';
    });
  }

  ['f-name', 'f-email', 'f-interest', 'f-details'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var key = id.replace('f-', '');
    el.addEventListener('blur', function () {
      touched[key] = true;
      showErrs(validate(), false);
    });
    el.addEventListener('input', function () {
      if (touched[key]) showErrs(validate(), false);
    });
  });

  if (fileInput && fileNameEl) {
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      fileNameEl.textContent = f ? f.name : 'no file selected';
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var errs = validate();
    touched.name = true; touched.email = true; touched.interest = true; touched.details = true;
    showErrs(errs, true);
    if (Object.keys(errs).length > 0) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    // TODO: replace setTimeout with a real form endpoint (Resend, Formspree, etc.)
    setTimeout(function () {
      form.hidden = true;
      successEl.hidden = false;
    }, 900);
  });

  if (sendAnother) {
    sendAnother.addEventListener('click', function () {
      form.reset();
      touched.name = touched.email = touched.interest = touched.details = false;
      clearErrs();
      if (fileNameEl) fileNameEl.textContent = 'no file selected';
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Start a Custom Order <svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16h20M19 9l7 7-7 7"/></svg>';
      form.hidden = false;
      successEl.hidden = true;
    });
  }

  // Hide sticky CTA pill when form submit button is visible
  if (submitRow && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      document.body.dataset.contactVisible = entries[0].isIntersecting ? '1' : '0';
    }, { threshold: 0.01 });
    io.observe(submitRow);
  }
})();
