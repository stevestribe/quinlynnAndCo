/**
 * Site-specific config for the Quinlynn & Co. staging editor.
 * To reuse the admin engine on another site, copy admin/, admin.css, and admin.js
 * and replace this file with your own ADMIN_CONFIG / ADMIN_FIELDS / ADMIN_SECTION_ORDER.
 */

window.ADMIN_CONFIG = {
  githubRepo:     'stevestribe/quinlynnAndCo',
  githubBranch:   'main',
  contentPath:    'site/content/pages/home.md',
  deployWorkflow: 'deploy-staging.yml',
  deployTarget:   'staging',
  siteIndexUrl:   '/index.html',
};

/**
 * ADMIN_FIELDS — every independently-editable text block on the page.
 *
 * key      : matches the QC marker in index.html (e.g. <!-- QC:hero-title -->)
 *            For product cards use the card slot name (card1 … card6).
 * label    : shown in the popup header
 * type     : 'input' | 'textarea' | 'card'
 * section  : top-level section in home.md (## section)
 * sub      : subsection key in home.md (### sub)
 * hint     : optional help text shown in the popup (overrides default markdown hint)
 */
window.ADMIN_FIELDS = {
  // ── Labels ────────────────────────────────────────────────────────────────
  'label-about':    { label: 'About nav label',    type: 'input',    section: 'labels',   sub: 'about' },
  'label-products': { label: 'Products nav label', type: 'input',    section: 'labels',   sub: 'products' },
  'label-contact':  { label: 'Contact nav label',  type: 'input',    section: 'labels',   sub: 'contact' },

  // ── Hero ──────────────────────────────────────────────────────────────────
  'hero-title':     { label: 'Hero headline',      type: 'textarea', section: 'hero',     sub: 'title' },
  'hero-sub':       { label: 'Hero subheading',    type: 'textarea', section: 'hero',     sub: 'sub' },

  // ── About ─────────────────────────────────────────────────────────────────
  'about-heading':  { label: 'About heading',      type: 'textarea', section: 'about',    sub: 'heading' },
  'about-bio1':     { label: 'Bio — first para',   type: 'textarea', section: 'about',    sub: 'bio1' },
  'about-quote':    { label: 'Pull quote',         type: 'textarea', section: 'about',    sub: 'quote' },
  'about-bio2':     { label: 'Bio — second para',  type: 'textarea', section: 'about',    sub: 'bio2' },
  'about-sign':     { label: 'Signature',          type: 'input',    section: 'about',    sub: 'sign' },
  'about-meta':     { label: 'Aside details',      type: 'textarea', section: 'about',    sub: 'meta',
                      hint: 'One detail per line' },

  // ── Products ──────────────────────────────────────────────────────────────
  'products-heading': { label: 'Products heading', type: 'textarea', section: 'products', sub: 'heading' },
  'card1':          { label: 'Card 1',             type: 'card',     section: 'products', sub: 'card1' },
  'card2':          { label: 'Card 2',             type: 'card',     section: 'products', sub: 'card2' },
  'card3':          { label: 'Card 3',             type: 'card',     section: 'products', sub: 'card3' },
  'card4':          { label: 'Card 4',             type: 'card',     section: 'products', sub: 'card4' },
  'card5':          { label: 'Card 5',             type: 'card',     section: 'products', sub: 'card5' },
  'card6':          { label: 'Card 6',             type: 'card',     section: 'products', sub: 'card6' },

  // ── Inquire ───────────────────────────────────────────────────────────────
  'inquire-heading': { label: 'Inquire heading',   type: 'textarea', section: 'inquire',  sub: 'heading' },
  'inquire-lede':   { label: 'Intro paragraph',    type: 'textarea', section: 'inquire',  sub: 'lede' },
  'inquire-thanks-h': { label: 'Thank-you heading', type: 'textarea', section: 'inquire', sub: 'thanks-h' },
  'inquire-thanks-p': { label: 'Thank-you body',   type: 'textarea', section: 'inquire',  sub: 'thanks-p',
                        hint: 'Plain text only' },
  'inquire-etsy-note': { label: 'Etsy browse note', type: 'textarea', section: 'inquire', sub: 'etsy-note',
                         hint: 'Use **bold** for emphasis' },

  // ── Footer ────────────────────────────────────────────────────────────────
  'footer-tagline': { label: 'Footer tagline',     type: 'textarea', section: 'footer',   sub: 'tagline' },
};

/**
 * ADMIN_SECTION_ORDER — defines how sections and keys are written back to
 * the markdown file. Must cover every section/key that ADMIN_FIELDS references.
 */
window.ADMIN_SECTION_ORDER = [
  { id: 'labels',   keys: ['about', 'products', 'contact'] },
  { id: 'hero',     keys: ['title', 'sub'] },
  { id: 'about',    keys: ['heading', 'bio1', 'quote', 'bio2', 'sign', 'meta'] },
  { id: 'products', keys: ['heading', 'card1', 'card2', 'card3', 'card4', 'card5', 'card6'] },
  { id: 'inquire',  keys: ['heading', 'lede', 'thanks-h', 'thanks-p', 'etsy-note'] },
  { id: 'footer',   keys: ['tagline'] },
];
