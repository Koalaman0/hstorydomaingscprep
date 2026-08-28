# -*- coding: utf-8 -*-
"""
functions/_lib/sanitize.js와 동일한 화이트리스트 필터의 파이썬 버전.
관리자 JSON export를 로컬에서 수동으로 반영할 때(import_admin_export.py)도
동일한 방어를 적용하기 위한 것입니다.
"""
import re

ALLOWED_TAGS = {
    "h2", "h3", "p", "strong", "b", "em", "i", "u", "s",
    "a", "img", "ul", "ol", "li", "blockquote", "br", "span",
}
ALLOWED_ATTRS = {
    "a": ["href", "target"],
    "img": ["src", "alt"],
    "span": ["style"],
    "p": ["style"],
    "h2": ["style"],
    "h3": ["style"],
    "li": ["style"],
}

_DANGEROUS_BLOCK = re.compile(r'<(script|style|iframe|object|embed|form|svg|math)\b[^>]*>[\s\S]*?</\1\s*>', re.IGNORECASE)
_DANGEROUS_VOID = re.compile(r'<(iframe|object|embed|form|link|meta|base|svg|math|script|style)\b[^>]*/?>', re.IGNORECASE)
_TAG_RE = re.compile(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>')
_ATTR_RE = re.compile(r'''([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')''')


def _is_safe_url(value):
    v = value.strip().lower()
    return not (v.startswith("javascript:") or v.startswith("data:") or v.startswith("vbscript:"))


def _is_safe_style(value):
    v = value.lower()
    if "expression" in v or "url(" in v or "javascript:" in v or "</" in v:
        return False
    for decl in [d.strip() for d in value.split(";") if d.strip()]:
        if ":" not in decl:
            return False
        prop = decl.split(":", 1)[0].strip().lower()
        if prop not in ("color", "background-color", "font-size", "text-align"):
            return False
    return True


def _sanitize_attrs(tag, attr_string):
    allowed = ALLOWED_ATTRS.get(tag, [])
    if not allowed:
        return ""
    out = ""
    for m in _ATTR_RE.finditer(attr_string):
        name = m.group(1).lower()
        value = m.group(2) if m.group(2) is not None else m.group(3)
        if name.startswith("on"):
            continue
        if name not in allowed:
            continue
        if name in ("href", "src") and not _is_safe_url(value):
            continue
        if name == "style" and not _is_safe_style(value):
            continue
        safe_value = "_blank" if name == "target" else value
        out += f' {name}="{safe_value.replace(chr(34), "&quot;")}"'
    if tag == "a":
        out += ' rel="noopener noreferrer nofollow"'
    return out


def sanitize_html(html_str):
    if not html_str:
        return ""
    out = _DANGEROUS_BLOCK.sub("", html_str)
    out = _DANGEROUS_VOID.sub("", out)

    def _repl(m):
        is_closing, tag, attrs = m.group(1), m.group(2).lower(), m.group(3)
        if tag not in ALLOWED_TAGS:
            return ""
        if is_closing:
            return f"</{tag}>"
        return f"<{tag}{_sanitize_attrs(tag, attrs)}>"

    return _TAG_RE.sub(_repl, out)
