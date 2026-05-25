/**
 * Site-specific config for the Quinlynn & Co. staging editor.
 *
 * The admin engine (admin.js) is site-agnostic — to reuse it elsewhere,
 * copy admin/, admin.css, admin.js, and index.html, then replace this file
 * with your site's own ADMIN_CONFIG and ADMIN_FIELDS.
 */
(function () {
  'use strict';

  // ── Repo + deploy config ──────────────────────────────────────────────────

  window.ADMIN_CONFIG = {
    githubRepo:     'stevestribe/quinlynnAndCo',
    githubBranch:   'main',
    contentPath:    'site/content/pages/home.md',
    deployWorkflow: 'deploy-staging.yml',
    deployTarget:   'staging',
    siteIndexUrl:   '/index.html',
  };

  // ── Site-specific render helpers ──────────────────────────────────────────

  function wrapPullQuote(html) {
    return '“' + html + '”';
  }

  function indentAboutMeta(html) {
    // Match the Quinlynn template indentation around the QC marker so the
    // injected block sits exactly where the original lines were.
    return '\n          ' + html.replace(/\n/g, '\n          ') + '\n        ';
  }

  // ── Product cards (Quinlynn-specific list field) ──────────────────────────

  var CARD_COLORS = ['warm', 'sage', '', 'taupe', 'deep', 'warm'];
  var ETSY_URL    = 'https://thewaysofherhome.etsy.com';
  var ARROW_SVG   =
    '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" ' +
    'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 16h20M19 9l7 7-7 7" /></svg>';

  function parseCard(raw) {
    var lines  = (raw || '').split('\n').map(function (l) { return l.trim(); });
    var pieces = (lines[0] || '').split('|').map(function (p) { return p.trim(); });
    return {
      name:  pieces[0] || '',
      price: pieces[1] || '',
      tag:   pieces[2] || '',
      desc:  lines[1]  || '',
    };
  }

  function serializeCard(cd) {
    return (cd.name || '') + ' | ' + (cd.price || '') + ' | ' + (cd.tag || '') +
           '\n' + (cd.desc || '');
  }

  function renderCards(productsSection, helpers) {
    var esc = helpers.esc;
    var parts = [];
    for (var i = 0; i < 6; i++) {
      var key = 'card' + (i + 1);
      var raw = productsSection[key];
      if (!raw) continue;
      var cd    = parseCard(raw);
      var color = CARD_COLORS[i];
      var phCls = 'ph' + (color ? ' ' + color : '') + ' inner';
      parts.push(
        '\n        <a class="pcard" data-card-key="' + key + '" href="' + ETSY_URL + '" ' +
        'target="_blank" rel="noopener noreferrer">\n' +
        '          <div class="pcard-img"><div class="' + phCls + '">' +
        (cd.tag ? '<span class="ph-tag">' + esc(cd.tag) + '</span>' : '') + '</div></div>\n' +
        '          <div class="pcard-meta">\n' +
        '            <div class="pcard-name">' + esc(cd.name) + helpers.pencilBtn(key) + '</div>\n' +
        '            <div class="pcard-price">' + esc(cd.price) + '</div>\n' +
        (cd.desc ? '            <p class="pcard-desc">' + esc(cd.desc) + '</p>\n' : '') +
        '            <span class="pcard-cta">View on Etsy\n              ' + ARROW_SVG + '\n            </span>\n' +
        '          </div>\n        </a>\n'
      );
    }
    return parts.join('');
  }

  function liveUpdateCard(iframeDoc, key, item) {
    var card = iframeDoc.querySelector('[data-card-key="' + key + '"]');
    if (!card) return;
    var n = card.querySelector('.pcard-name');
    if (n) {
      // Pencil lives inside .pcard-name; pluck it out before replacing text.
      var pencil = n.querySelector('.qc-pencil');
      n.textContent = item.name || '';
      if (pencil) n.appendChild(pencil);
    }
    var p = card.querySelector('.pcard-price'); if (p) p.textContent = item.price || '';
    var t = card.querySelector('.ph-tag');      if (t) t.textContent = item.tag   || '';
    var d = card.querySelector('.pcard-desc');  if (d) d.textContent = item.desc  || '';
  }

  function liveUpdateAboutMeta(iframeDoc, key, html) {
    var c = iframeDoc.querySelector('.about-aside-meta');
    if (!c) return;
    var pencil = c.querySelector('.qc-pencil');
    c.innerHTML = html || '';
    if (pencil) c.appendChild(pencil);
  }

  // ── Field declarations ────────────────────────────────────────────────────
  //
  // Each field declares:
  //   label    — shown in the popup header
  //   type     — 'input' | 'textarea' | 'list'
  //   section  — top-level section in home.md (## section)
  //   sub      — subsection key in home.md (### sub)
  //   render   — 'md' (default) | 'escape' | 'lines'
  //   wrap     — optional post-render transform (parent-context function)
  //   liveUpdate(iframeDoc, key, value)
  //            — optional. If present, the engine calls it directly on every
  //              keystroke instead of posting the default qcText message. Runs
  //              in the parent admin context with direct DOM access.
  //   pencilStyle — 'block' to render the pencil button after the closing QC
  //                 marker instead of wrapping the QC region in span.qc-text.
  //   hint     — optional help text shown in the popup footer.

  window.ADMIN_FIELDS = {
    // Labels
    'label-about':    { label: 'About nav label',    type: 'input',    section: 'labels',   sub: 'about',    render: 'escape' },
    'label-products': { label: 'Products nav label', type: 'input',    section: 'labels',   sub: 'products', render: 'escape' },
    'label-contact':  { label: 'Contact nav label',  type: 'input',    section: 'labels',   sub: 'contact',  render: 'escape' },

    // Hero
    'hero-title':     { label: 'Hero headline',      type: 'textarea', section: 'hero',     sub: 'title' },
    'hero-sub':       { label: 'Hero subheading',    type: 'textarea', section: 'hero',     sub: 'sub' },

    // About
    'about-heading':  { label: 'About heading',      type: 'textarea', section: 'about',    sub: 'heading' },
    'about-bio1':     { label: 'Bio — first para',   type: 'textarea', section: 'about',    sub: 'bio1' },
    'about-quote':    { label: 'Pull quote',         type: 'textarea', section: 'about',    sub: 'quote',
                        wrap: wrapPullQuote },
    'about-bio2':     { label: 'Bio — second para',  type: 'textarea', section: 'about',    sub: 'bio2' },
    'about-sign':     { label: 'Signature',          type: 'input',    section: 'about',    sub: 'sign',  render: 'escape' },
    'about-meta':     { label: 'Aside details',      type: 'textarea', section: 'about',    sub: 'meta',
                        render: 'lines', wrap: indentAboutMeta,
                        pencilStyle: 'block',
                        liveUpdate: liveUpdateAboutMeta,
                        hint: 'One detail per line' },

    // Products
    'products-heading': { label: 'Products heading', type: 'textarea', section: 'products', sub: 'heading' },
    'products-cards': {
      label:        'Product cards',
      type:         'list',
      section:      'products',
      itemKeys:     ['card1', 'card2', 'card3', 'card4', 'card5', 'card6'],
      itemSchema: {
        name:  { label: 'Name',        type: 'input' },
        price: { label: 'Price',       type: 'input' },
        tag:   { label: 'Tag',         type: 'input' },
        desc:  { label: 'Description', type: 'input' },
      },
      parseItem:    parseCard,
      serializeItem: serializeCard,
      renderList:   renderCards,
      liveUpdate:   liveUpdateCard,
    },

    // Inquire
    'inquire-heading':   { label: 'Inquire heading',   type: 'textarea', section: 'inquire', sub: 'heading' },
    'inquire-lede':      { label: 'Intro paragraph',   type: 'textarea', section: 'inquire', sub: 'lede' },
    'inquire-thanks-h':  { label: 'Thank-you heading', type: 'textarea', section: 'inquire', sub: 'thanks-h' },
    'inquire-thanks-p':  { label: 'Thank-you body',    type: 'textarea', section: 'inquire', sub: 'thanks-p',
                           render: 'escape', hint: 'Plain text only' },
    'inquire-etsy-note': { label: 'Etsy browse note',  type: 'textarea', section: 'inquire', sub: 'etsy-note',
                           hint: 'Use **bold** for emphasis' },

    // Footer
    'footer-tagline':    { label: 'Footer tagline',    type: 'textarea', section: 'footer',  sub: 'tagline' },
  };

  // ADMIN_SECTION_ORDER is now optional; the engine derives the markdown
  // serialisation order from ADMIN_FIELDS in declaration order. Set this
  // explicitly only if the desired output order differs from declaration order.
  // window.ADMIN_SECTION_ORDER = [...];

})();
