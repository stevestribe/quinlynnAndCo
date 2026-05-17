#!/usr/bin/env python3
"""Inject content from site/content/pages/home.md into site/index.html."""

import html as html_lib
import re
import sys
import pathlib

try:
    import markdown as md_lib
    HAS_MD = True
except ImportError:
    HAS_MD = False
    print("Warning: 'markdown' not installed. Run: pip install markdown", file=sys.stderr)

ROOT         = pathlib.Path(__file__).parent.parent
CONTENT_FILE = ROOT / "site" / "content" / "pages" / "home.md"
INDEX_FILE   = ROOT / "site" / "index.html"

# ── SVG constants ─────────────────────────────────────────────────────────

_ARROW_SVG = (
    '<svg width="14" height="14" viewBox="0 0 32 32" fill="none" '
    'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true">'
    '<path d="M6 16h20M19 9l7 7-7 7" /></svg>'
)

_STEP_SVGS = [
    ('<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" '
     'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">'
     '<rect x="5" y="9" width="22" height="15" rx="0.5" />'
     '<path d="M5 10l11 8 11-8" /></svg>'),
    ('<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" '
     'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">'
     '<rect x="4" y="7" width="16" height="16" rx="0.5" />'
     '<rect x="12" y="13" width="16" height="12" rx="0.5" /></svg>'),
    ('<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" '
     'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">'
     '<path d="M7 12h18l-1.5 14.5a1 1 0 0 1-1 .9H9.5a1 1 0 0 1-1-.9L7 12z" />'
     '<path d="M11 12V9a5 5 0 0 1 10 0v3" /></svg>'),
]

_CARD_COLORS = ['warm', 'sage', '', 'taupe', 'deep', 'warm']

# ── Parsing ───────────────────────────────────────────────────────────────

def strip_frontmatter(text):
    return re.sub(r'^---\r?\n.*?\r?\n---\r?\n', '', text, flags=re.DOTALL)


def parse_content(text):
    """Return dict[section][subsection] = content_text."""
    body = strip_frontmatter(text)
    out  = {}
    sec_parts = re.split(r'^## +(\S.*?)$', body, flags=re.MULTILINE)
    for i in range(1, len(sec_parts), 2):
        sec_name  = sec_parts[i].strip().lower()
        sec_body  = sec_parts[i + 1] if i + 1 < len(sec_parts) else ''
        out[sec_name] = {}
        sub_parts = re.split(r'^### +(.+?)$', sec_body, flags=re.MULTILINE)
        for j in range(1, len(sub_parts), 2):
            sub_name    = sub_parts[j].strip().lower()
            sub_content = sub_parts[j + 1].strip() if j + 1 < len(sub_parts) else ''
            out[sec_name][sub_name] = sub_content
    return out


# ── Rendering helpers ─────────────────────────────────────────────────────

def md_inline(text):
    """Render markdown to inline HTML (no wrapping <p> tag)."""
    if not text.strip():
        return text
    if HAS_MD:
        h = md_lib.markdown(text.strip())
        h = re.sub(r'^<p>', '', h)
        h = re.sub(r'</p>\s*$', '', h)
        return h
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\*(.+?)\*',     r'<em>\1</em>',         text)
    return text.strip()


def esc(text):
    return html_lib.escape(text)


# ── Product cards ─────────────────────────────────────────────────────────

def render_product_cards(secs):
    """Generate HTML for all product cards from sections dict."""
    parts = []
    for idx in range(6):
        key  = f'card{idx + 1}'
        text = secs.get(key, '')
        if not text:
            continue
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        if not lines:
            continue
        pieces = [p.strip() for p in lines[0].split('|')]
        name  = pieces[0] if len(pieces) > 0 else ''
        price = pieces[1] if len(pieces) > 1 else ''
        tag   = pieces[2] if len(pieces) > 2 else ''
        desc  = lines[1] if len(lines) > 1 else ''
        color = _CARD_COLORS[idx]
        ph_cls = f'ph {color} inner' if color else 'ph inner'
        ph_tag = f'<span class="ph-tag">{esc(tag)}</span>' if tag else ''
        parts.append(
            f'\n        <a class="pcard" href="https://thewaysofherhome.etsy.com" '
            f'target="_blank" rel="noopener noreferrer">\n'
            f'          <div class="pcard-img"><div class="{ph_cls}">{ph_tag}</div></div>\n'
            f'          <div class="pcard-meta">\n'
            f'            <div class="pcard-name">{esc(name)}</div>\n'
            f'            <div class="pcard-price">{esc(price)}</div>\n'
            f'            <p class="pcard-desc">{esc(desc)}</p>\n'
            f'            <span class="pcard-cta">View on Etsy\n'
            f'              {_ARROW_SVG}\n'
            f'            </span>\n'
            f'          </div>\n'
            f'        </a>\n'
        )
    return ''.join(parts)


# ── Custom steps ──────────────────────────────────────────────────────────

def render_custom_steps(secs):
    """Generate HTML for the three custom order steps."""
    parts = []
    for idx in range(3):
        key  = f'step{idx + 1}'
        text = secs.get(key, '')
        if not text:
            continue
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        title   = lines[0] if lines else ''
        body    = ' '.join(lines[1:]) if len(lines) > 1 else ''
        num     = f'Step {idx + 1:02d}'
        svg     = _STEP_SVGS[idx] if idx < len(_STEP_SVGS) else ''
        delay   = idx + 1
        conn    = '<div class="step-connector" aria-hidden="true"></div>' if idx < 2 else ''
        parts.append(
            f'\n      <div class="step reveal" data-delay="{delay}">\n'
            f'        <div class="step-top">\n'
            f'          <span class="step-num">{num}</span>\n'
            f'          <span class="step-icon" aria-hidden="true">{svg}</span>\n'
            f'        </div>\n'
            f'        <div class="step-title">{esc(title)}</div>\n'
            f'        <p class="step-body">{esc(body)}</p>\n'
            f'        {conn}\n'
            f'      </div>\n'
        )
    return ''.join(parts)


# ── Injection ─────────────────────────────────────────────────────────────

def inject(html, key, inner):
    """Replace content between <!-- QC:key --> ... <!-- /QC:key --> markers."""
    pat = re.compile(
        r'(<!-- QC:' + re.escape(key) + r' -->)(.*?)(<!-- /QC:' + re.escape(key) + r' -->)',
        re.DOTALL
    )
    result, n = pat.subn(lambda m: m.group(1) + inner + m.group(3), html)
    if n == 0:
        print(f'Warning: marker QC:{key} not found in index.html', file=sys.stderr)
    return result


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    if not CONTENT_FILE.exists():
        print(f'Content file not found: {CONTENT_FILE}', file=sys.stderr)
        sys.exit(1)
    if not INDEX_FILE.exists():
        print(f'Index file not found: {INDEX_FILE}', file=sys.stderr)
        sys.exit(1)

    secs = parse_content(CONTENT_FILE.read_text(encoding='utf-8'))
    html = INDEX_FILE.read_text(encoding='utf-8')

    def get(section, sub):
        return secs.get(section, {}).get(sub, '')

    # Simple inline injections
    simple = [
        ('hero-title',      md_inline(get('hero', 'title'))),
        ('hero-sub',        md_inline(get('hero', 'sub'))),
        ('about-heading',   md_inline(get('about', 'heading'))),
        ('about-bio1',      md_inline(get('about', 'bio1'))),
        ('about-quote',     '“' + md_inline(get('about', 'quote')) + '”'),
        ('about-bio2',      md_inline(get('about', 'bio2'))),
        ('products-heading', md_inline(get('products', 'heading'))),
        ('custom-heading',  md_inline(get('custom', 'heading'))),
        ('custom-lede',     md_inline(get('custom', 'lede'))),
        ('contact-heading', md_inline(get('contact', 'heading'))),
        ('contact-body',    md_inline(get('contact', 'body'))),
        ('footer-tagline',  md_inline(get('footer', 'tagline'))),
    ]
    for key, value in simple:
        if value:
            html = inject(html, key, value)

    # Generated block injections
    products_html = render_product_cards(secs.get('products', {}))
    if products_html:
        html = inject(html, 'products-cards', products_html)

    steps_html = render_custom_steps(secs.get('custom', {}))
    if steps_html:
        html = inject(html, 'custom-steps', steps_html)

    INDEX_FILE.write_text(html, encoding='utf-8')
    print('Build complete: site/index.html updated.')


if __name__ == '__main__':
    main()
