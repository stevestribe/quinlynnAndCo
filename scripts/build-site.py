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

    # Build about-meta block (one <div> per non-empty line)
    meta_lines = [l.strip() for l in get('about', 'meta').split('\n') if l.strip()]
    about_meta_html = '\n          '.join(f'<div>{esc(l)}</div>' for l in meta_lines)
    if about_meta_html:
        about_meta_html = '\n          ' + about_meta_html + '\n        '

    # Nav/section label injections (driven by ## labels in home.md)
    labels = secs.get('labels', {})
    simple = [
        ('label-about',    esc(labels.get('about',    ''))),
        ('label-products', esc(labels.get('products', ''))),
        ('label-contact',  esc(labels.get('contact',  ''))),
        ('hero-title',      md_inline(get('hero', 'title'))),
        ('hero-sub',        md_inline(get('hero', 'sub'))),
        ('about-heading',   md_inline(get('about', 'heading'))),
        ('about-bio1',      md_inline(get('about', 'bio1'))),
        ('about-quote',     '”' + md_inline(get('about', 'quote')) + '”'),
        ('about-bio2',      md_inline(get('about', 'bio2'))),
        ('about-sign',      md_inline(get('about', 'sign'))),
        ('about-meta',      about_meta_html),
        ('products-heading', md_inline(get('products', 'heading'))),
        ('inquire-heading',   md_inline(get('inquire', 'heading'))),
        ('inquire-lede',      md_inline(get('inquire', 'lede'))),
        ('inquire-thanks-h',  md_inline(get('inquire', 'thanks-h'))),
        ('inquire-thanks-p',  esc(get('inquire', 'thanks-p'))),
        ('footer-tagline',  md_inline(get('footer', 'tagline'))),
    ]
    for key, value in simple:
        if value:
            html = inject(html, key, value)

    # Generated block injections
    products_html = render_product_cards(secs.get('products', {}))
    if products_html:
        html = inject(html, 'products-cards', products_html)

    INDEX_FILE.write_text(html, encoding='utf-8')
    print('Build complete: site/index.html updated.')


if __name__ == '__main__':
    main()
