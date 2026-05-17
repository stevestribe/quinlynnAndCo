#!/usr/bin/env python3
"""Inject content from site/content/pages/home.md into site/index.html."""

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


def md_inline(text):
    """Render markdown to inline HTML (no wrapping <p> tag)."""
    if not text.strip():
        return text
    if HAS_MD:
        html = md_lib.markdown(text.strip())
        html = re.sub(r'^<p>', '', html)
        html = re.sub(r'</p>\s*$', '', html)
        return html
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\*(.+?)\*',     r'<em>\1</em>',         text)
    return text.strip()


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

    pairs = [
        ('hero-title',      md_inline(get('hero', 'title'))),
        ('hero-sub',        md_inline(get('hero', 'sub'))),
        ('about-heading',   md_inline(get('about', 'heading'))),
        ('about-bio1',      md_inline(get('about', 'bio1'))),
        ('about-quote',     '“' + md_inline(get('about', 'quote')) + '”'),
        ('about-bio2',      md_inline(get('about', 'bio2'))),
        ('custom-lede',     md_inline(get('custom', 'lede'))),
        ('contact-heading', md_inline(get('contact', 'heading'))),
        ('contact-body',    md_inline(get('contact', 'body'))),
    ]

    for key, value in pairs:
        if value and value not in ('""', '“”'):
            html = inject(html, key, value)

    INDEX_FILE.write_text(html, encoding='utf-8')
    print('Build complete: site/index.html updated.')


if __name__ == '__main__':
    main()
