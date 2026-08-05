# -*- coding: utf-8 -*-
"""
히스토리노트 정적 사이트 생성기
- 데이터(data/*.js)와 정적 HTML 페이지를 함께 생성한다.
"""
import os, json, re, html, math
from datetime import date

import pathlib
ROOT = str(pathlib.Path(__file__).resolve().parent.parent)

# ---------------------------------------------------------------------------
# 콘텐츠 데이터 로드 — data/content.json이 단일 소스입니다.
# (관리자 화면에서 내보낸 JSON을 scripts/import_admin_export.py로 반영하면
#  이 파일이 갱신되고, 이 스크립트를 다시 실행하면 사이트 전체가 재생성됩니다.)
# ---------------------------------------------------------------------------
with open(os.path.join(ROOT, "data", "content.json"), encoding="utf-8") as _f:
    _content = json.load(_f)

SITE = _content["config"]
CATEGORIES = _content["categories"]
POSTS = _content["posts"]
COLUMNS = _content["columns"]

print(f"posts={len(POSTS)} columns={len(COLUMNS)} categories={len(CATEGORIES)}")

def cat(slug):
    return next(c for c in CATEGORIES if c["slug"] == slug)

# ---------------------------------------------------------------------------
# 유틸
# ---------------------------------------------------------------------------
def esc(s):
    return html.escape(s, quote=True)

def slugify_kr(s):
    return s

def fmt_date(d):
    y, m, dd = d.split("-")
    return f"{y}.{m}.{dd}"

def is_published(item):
    return item.get("status", "published") != "draft"

# 실제 공개 페이지로 만들 항목 (초안(draft)은 admin에는 남아있지만 공개되지 않습니다)
PUBLISHED_POSTS = [p for p in POSTS if is_published(p)]
PUBLISHED_COLUMNS = [c for c in COLUMNS if is_published(c)]

def post_by_slug(slug):
    return next(p for p in PUBLISHED_POSTS if p["slug"] == slug)

def _safe_post(slug):
    return next((p for p in PUBLISHED_POSTS if p["slug"] == slug), None)

def col_by_slug(slug):
    return next(c for c in PUBLISHED_COLUMNS if c["slug"] == slug)

def posts_in_cat(cat_slug):
    return [p for p in PUBLISHED_POSTS if p["category"] == cat_slug]

def all_content_sorted_by_modified():
    items = [("post", p) for p in PUBLISHED_POSTS] + [("column", c) for c in PUBLISHED_COLUMNS]
    items.sort(key=lambda kv: kv[1]["modified"], reverse=True)
    return items

def latest_posts(n=6):
    ps = sorted(PUBLISHED_POSTS, key=lambda p: p["modified"], reverse=True)
    return ps[:n]

def featured_posts(n=4):
    fs = [p for p in PUBLISHED_POSTS if p.get("featured")]
    fs = sorted(fs, key=lambda p: p["modified"], reverse=True)
    if len(fs) < n:
        rest = [p for p in PUBLISHED_POSTS if p not in fs]
        fs = fs + sorted(rest, key=lambda p: p["modified"], reverse=True)[: n - len(fs)]
    return fs[:n]

# ---------------------------------------------------------------------------
# 공통 레이아웃
# ---------------------------------------------------------------------------
NAV_ITEMS = [
    ("/", "홈"),
    ("/categories/", "카테고리"),
    ("/columns/", "칼럼"),
    ("/about/", "사이트 소개"),
    ("/author/", "운영자"),
    ("/contact/", "문의"),
]

def owner_link(cls=""):
    return f'<a href="/author/" class="owner-link {cls}">{esc(SITE["owner_name"])}</a>'

def head(title, description, canonical_path, og_type="website", json_ld=None, noindex=False):
    canonical = SITE["url"].rstrip("/") + canonical_path
    robots = "noindex,follow" if noindex else "index,follow"
    ld_block = ""
    if json_ld:
        ld_block = f'<script type="application/ld+json">{json.dumps(json_ld, ensure_ascii=False)}</script>'
    return f"""<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{canonical}">
<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{esc(SITE['name'])}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{canonical}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600;700&family=Noto+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
{ld_block}"""

def breadcrumb_html(items):
    # items: list of (label, path or None for current)
    lis = []
    ld_items = []
    for i, (label, path) in enumerate(items):
        pos = i + 1
        if path:
            lis.append(f'<li><a href="{path}">{esc(label)}</a></li>')
            ld_items.append({"@type": "ListItem", "position": pos, "name": label, "item": SITE["url"].rstrip("/") + path})
        else:
            lis.append(f'<li aria-current="page">{esc(label)}</li>')
            ld_items.append({"@type": "ListItem", "position": pos, "name": label})
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": ld_items}
    return (
        f'<nav class="breadcrumb" aria-label="브레드크럼"><ol>{"".join(lis)}</ol></nav>'
        f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>'
    )

def header_html(active="/"):
    links = []
    for path, label in NAV_ITEMS:
        cls = ' class="active"' if path == active else ""
        links.append(f'<li><a href="{path}"{cls}>{label}</a></li>')
    return f"""<a class="skip-link" href="#main">본문 바로가기</a>
<div id="admin-bar" class="admin-bar admin-only" hidden>
  <div class="admin-bar-inner">
    <span>관리자 모드로 접속 중입니다</span>
    <a href="/admin/">대시보드</a>
    <a href="/admin/#post-new">새 글 작성</a>
    <a href="/admin/#column-new">새 칼럼 작성</a>
    <button type="button" id="admin-logout">로그아웃</button>
  </div>
</div>
<header class="site-header">
  <div class="wrap header-inner">
    <a href="/" class="brand">
      <span class="brand-mark" aria-hidden="true">HN</span>
      <span class="brand-text">
        <strong>{esc(SITE['name'])}</strong>
        <small>{esc(SITE['tagline'])}</small>
      </span>
    </a>
    <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="site-nav">
      <span></span><span></span><span></span>
      <span class="sr-only">메뉴 열기</span>
    </button>
    <nav class="site-nav" id="site-nav">
      <ul>{''.join(links)}<li><a href="/login/" class="nav-login reader-cta">로그인</a></li></ul>
    </nav>
  </div>
</header>"""

def footer_html():
    cat_links = "".join(f'<li><a href="/categories/{c["slug"]}/">{c["name"]}</a></li>' for c in CATEGORIES)
    return f"""<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <span class="brand-mark" aria-hidden="true">HN</span>
      <p><strong>{esc(SITE['name'])}</strong><br>{esc(SITE['tagline'])}</p>
      <p class="footer-owner">운영자 {owner_link()} · <a href="mailto:{SITE['email']}">{SITE['email']}</a></p>
    </div>
    <div class="footer-col">
      <h2>카테고리</h2>
      <ul>{cat_links}</ul>
    </div>
    <div class="footer-col">
      <h2>사이트</h2>
      <ul>
        <li><a href="/about/">사이트 소개</a></li>
        <li><a href="/author/">운영자 소개</a></li>
        <li><a href="/columns/">칼럼</a></li>
        <li><a href="/contact/">문의하기</a></li>
        <li><a href="/sitemap/">사이트맵</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h2>정책</h2>
      <ul>
        <li><a href="/privacy/">개인정보처리방침</a></li>
        <li><a href="/terms/">이용약관</a></li>
        <li><a href="/disclaimer/">면책고지</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <p>&copy; 2026 {esc(SITE['name'])}. 이 사이트의 모든 글은 운영자 {owner_link()} 및 필진이 작성했습니다.</p>
    <p class="footer-contact">문의: <a href="mailto:{SITE['email']}">{SITE['email']}</a></p>
  </div>
</footer>
<script src="/assets/js/common.js"></script>"""

def page(title, description, canonical_path, active_nav, body_html, og_type="website", json_ld=None, noindex=False, body_class=""):
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
{head(title, description, canonical_path, og_type, json_ld, noindex)}
</head>
<body class="{body_class}">
{header_html(active_nav)}
<main id="main">
{body_html}
</main>
{footer_html()}
</body>
</html>"""

def write_page(rel_dir, html_str):
    d = os.path.join(ROOT, rel_dir.strip("/"))
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(html_str)

# ---------------------------------------------------------------------------
# 카드 컴포넌트
# ---------------------------------------------------------------------------
def post_card_html(p, kind="post"):
    is_col = kind == "column"
    href = f"/columns/{p['slug']}/" if is_col else f"/posts/{p['slug']}/"
    tag = f'<span class="tag tag-column">칼럼</span>' if is_col else f'<span class="tag">{esc(cat(p["category"])["name"])}</span>'
    feat = ' <span class="tag tag-featured">추천</span>' if p.get("featured") else ""
    return f"""<a class="post-card" href="{href}">
  {tag}{feat}
  <h3>{esc(p['title'])}</h3>
  <p>{esc(p.get('summary',''))}</p>
  <div class="card-meta"><span>{fmt_date(p['published'])}</span><span>수정 {fmt_date(p['modified'])}</span></div>
</a>"""

# ---------------------------------------------------------------------------
# 홈
# ---------------------------------------------------------------------------
def render_home():
    latest = latest_posts(6)
    feats = featured_posts(4)
    cat_chips = "".join(
        f"""<div class="cat-chip"><span class="idx">{str(i+1).zfill(2)}</span><h3><a href="/categories/{c['slug']}/">{c['name']}</a></h3><p>{esc(c['desc'][:44])}…</p></div>"""
        for i, c in enumerate(CATEGORIES)
    )
    latest_html = "".join(post_card_html(p) for p in latest)
    feat_html = "".join(post_card_html(p) for p in feats)
    col_preview = "".join(post_card_html(c, "column") for c in sorted(PUBLISHED_COLUMNS, key=lambda c: c["modified"], reverse=True)[:3])

    hero_image = SITE.get("hero_image_url") or ""
    hero_cls = "hero hero-has-image" if hero_image else "hero"
    hero_style = f' style="--hero-image:url(\'{esc(hero_image)}\')"' if hero_image else ""

    body = f"""
<section class="{hero_cls}"{hero_style}>
  <div class="hero-inner">
    <span class="hero-eyebrow">{esc(SITE['topic'])} 정보 사이트</span>
    <h1>{esc(SITE['tagline'])}</h1>
    <p class="hero-lead">{esc(SITE['name'])}는 {esc(SITE['audience'])}를 위해, 한국사와 세계사의 핵심 흐름과 인물, 사건을 쉬운 언어로 정리해 전달하는 정보 사이트입니다.</p>
    <div class="hero-actions">
      <a href="/categories/" class="btn btn-primary">카테고리 둘러보기</a>
      <a href="/columns/" class="btn btn-outline">운영자 칼럼 보기</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">대표 카테고리</span><h2>어디서부터 읽어도 좋습니다</h2></div>
      <a class="see-all" href="/categories/">전체 카테고리 보기 →</a>
    </div>
    <div class="cat-strip">{cat_chips}</div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">최신 글</span><h2>최근에 정리한 글</h2></div>
      <a class="see-all" href="/sitemap/">전체 글 목록 보기 →</a>
    </div>
    <div class="card-grid">{latest_html}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">추천 글</span><h2>입문자에게 먼저 추천하는 글</h2></div>
    </div>
    <div class="card-grid">{feat_html}</div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">운영 목적</span><h2>{esc(SITE['name'])}가 만들어진 이유</h2></div>
    </div>
    <p class="section-desc" style="max-width:70ch;">역사는 흥미롭지만, 처음 접할 때는 정보가 너무 많거나 지나치게 압축되어 있어 오히려 진입장벽처럼 느껴지곤 합니다.
    {esc(SITE['name'])}는 연도와 사건을 나열하기보다, 왜 그런 일이 벌어졌는지 맥락을 먼저 설명하는 것을 목표로 합니다.</p>
    <div class="principles" style="margin-top:28px;">
      <div class="principle"><h3>맥락을 우선합니다</h3><p>사건의 결과보다 원인과 배경을 먼저 설명해 흐름이 자연스럽게 이어지도록 씁니다.</p></div>
      <div class="principle"><h3>과장하지 않습니다</h3><p>확인되지 않은 최신 이슈나 자극적인 표현 대신, 검증 가능한 범위 안에서 담담하게 서술합니다.</p></div>
      <div class="principle"><h3>꾸준히 점검합니다</h3><p>발행된 글도 필요하면 다시 살펴보고 보완하며, 발행일과 수정일을 함께 표시합니다.</p></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">운영자</span><h2>누가 이 글들을 쓰고 있나요</h2></div>
    </div>
    <div class="owner-box">
      <span class="owner-seal" aria-hidden="true">{esc(SITE['owner_name'][0])}</span>
      <div>
        <span class="role">운영자 · 편집자</span>
        <h3>{owner_link()}</h3>
        <p>{esc(SITE['owner_bio'])}</p>
        <a href="/author/" class="btn btn-outline btn-sm">운영자 소개와 칼럼 보러 가기</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">칼럼</span><h2>운영자 칼럼 미리 보기</h2></div>
      <a class="see-all" href="/columns/">칼럼 전체 보기 →</a>
    </div>
    <div class="card-grid">{col_preview}</div>
  </div>
</section>

<section class="section">
  <div class="wrap" style="text-align:center;">
    <h2 style="margin-bottom:12px;">궁금한 점이나 제안이 있으신가요?</h2>
    <p class="section-desc" style="margin:0 auto 20px;">다루었으면 하는 주제, 잘못된 내용에 대한 제보 모두 이메일로 받고 있습니다.</p>
    <a href="/contact/" class="btn btn-primary">문의하기</a>
  </div>
</section>
"""
    json_ld = {
        "@context": "https://schema.org", "@type": "WebSite",
        "name": SITE["name"], "url": SITE["url"], "description": SITE["tagline"],
    }
    return page(f"{SITE['name']} — {SITE['tagline']}",
                f"{SITE['name']}는 {SITE['audience']}를 위한 {SITE['topic']} 정보 사이트입니다. 한국사와 세계사의 핵심 주제를 쉬운 언어로 정리해 전달합니다.",
                "/", "/", body, json_ld=json_ld)

# ---------------------------------------------------------------------------
# 카테고리 목록/상세
# ---------------------------------------------------------------------------
def render_categories_list():
    chips = "".join(f"""
    <div class="cat-chip">
      <span class="idx">{str(i+1).zfill(2)}</span>
      <h3><a href="/categories/{c['slug']}/">{c['name']}</a></h3>
      <p>{esc(c['desc'])}</p>
      <p style="margin-top:8px;font-size:12.5px;color:var(--brass-dark);">{len(posts_in_cat(c['slug']))}개의 글</p>
    </div>""" for i, c in enumerate(CATEGORIES))
    body = f"""
{breadcrumb_html([("홈","/"),("카테고리", None)])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">카테고리</span>
    <h1>{esc(SITE['name'])}의 주제 구조</h1>
    <p class="section-desc">아래 다섯 개 카테고리를 중심으로 콘텐츠를 운영하고 있습니다. 관심 있는 주제부터 편하게 살펴보세요.</p>
    <div class="cat-strip" style="grid-template-columns:repeat(3,1fr);margin-top:28px;">{chips}</div>
  </div>
</section>
"""
    return page("카테고리 전체 보기", f"{SITE['name']}의 대표 카테고리 목록입니다. 한국사, 세계사, 인물, 전쟁과 사건, 유물과 문화유산 등 주제별로 글을 찾아볼 수 있습니다.",
                "/categories/", "/categories/", body)

def render_category_detail(c):
    posts = sorted(posts_in_cat(c["slug"]), key=lambda p: p["modified"], reverse=True)
    cards = "".join(post_card_html(p) for p in posts)
    body = f"""
{breadcrumb_html([("홈","/"),("카테고리","/categories/"),(c["name"], None)])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">카테고리</span>
    <h1>{c['name']}</h1>
    <p class="section-desc">{esc(c['desc'])}</p>
  </div>
</section>
<section class="section section-alt">
  <div class="wrap">
    <div class="card-grid">{cards}</div>
  </div>
</section>
"""
    json_ld = {"@context":"https://schema.org","@type":"CollectionPage","name": c["name"], "description": c["desc"]}
    return page(f"{c['name']} — {SITE['name']}", f"{c['desc']} {SITE['name']}에서 {c['name']} 관련 글 {len(posts)}개를 확인해 보세요.",
                f"/categories/{c['slug']}/", "/categories/", body, json_ld=json_ld)

# ---------------------------------------------------------------------------
# 글 상세
# ---------------------------------------------------------------------------
def render_post_detail(p):
    c = cat(p["category"])
    toc_source = p.get("toc") or [h for h, _ in p["body"]]
    toc_html = "".join(f'<li><a href="#sec-{i}">{esc(h)}</a></li>' for i, h in enumerate(toc_source))
    body_sections = "".join(
        f'<h2 id="sec-{i}">{esc(h)}</h2>' + "".join(f"<p>{esc(par)}</p>" for par in pars)
        for i, (h, pars) in enumerate(p["body"])
    )
    key_points_list = p.get("key_points") or []
    mistakes_list = p.get("mistakes") or []
    checklist_list = p.get("checklist") or []
    key_points = "".join(f"<li>{esc(k)}</li>" for k in key_points_list)
    mistakes = "".join(f"<li>{esc(k)}</li>" for k in mistakes_list)
    checklist = "".join(f'<li><input type="checkbox" id="chk-{i}"><label for="chk-{i}">{esc(k)}</label></li>' for i, k in enumerate(checklist_list))
    summary_box = f'<div class="box box-summary"><h3>핵심 요약</h3><ul>{key_points}</ul></div>' if key_points_list else ""
    mistake_box = f'<div class="box box-mistake"><h3>초보자가 자주 하는 실수</h3><ul>{mistakes}</ul></div>' if mistakes_list else ""
    checklist_box = f'<div class="box"><h3>정리 체크리스트</h3><ul class="checklist">{checklist}</ul></div>' if checklist_list else ""
    related_posts = [x for x in (_safe_post(s) for s in (p.get("related") or []) if s) if x]
    related_html = "".join(post_card_html(r) for r in related_posts)
    faq_html = ""
    faq_ld = None
    if p.get("faq"):
        faq_html = '<div class="box"><h3>자주 묻는 질문</h3>' + "".join(
            f'<details class="faq-item"><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in p["faq"]
        ) + '</div>'
        faq_ld = {
            "@context": "https://schema.org", "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faq"]],
        }

    article_ld = {
        "@context": "https://schema.org", "@type": "Article",
        "headline": p["title"], "description": p["summary"],
        "author": {"@type": "Person", "name": SITE["owner_name"]},
        "datePublished": p["published"], "dateModified": p["modified"],
        "publisher": {"@type": "Organization", "name": SITE["name"]},
    }

    body = f"""
{breadcrumb_html([("홈","/"),("카테고리","/categories/"),(c["name"], f"/categories/{c['slug']}/"), (p["title"], None)])}
<header class="post-header wrap">
  <span class="tag">{c['name']}</span>
  <h1>{esc(p['title'])}</h1>
  <p class="post-subtitle">{esc(p['subtitle'])}</p>
  <div class="post-meta">
    <span>작성자 <strong>{esc(SITE['owner_name'])}</strong></span>
    <span>작성일 <strong>{fmt_date(p['published'])}</strong></span>
    <span>수정일 <strong>{fmt_date(p['modified'])}</strong></span>
  </div>
</header>
<div class="wrap post-layout">
  <article class="post-body">
    {body_sections}
    {summary_box}
    {mistake_box}
    {checklist_box}
    {faq_html}
    <p class="update-note">이 글은 초보자 기준으로 이해하기 쉽게 정리되었으며, 내용은 운영 과정에서 순차적으로 보완될 수 있습니다.</p>
    <div class="editor-box">
      <span class="owner-seal" aria-hidden="true">{esc(SITE['owner_name'][0])}</span>
      <div><strong>{owner_link()}</strong><p>{esc(SITE['owner_bio'])}</p></div>
    </div>
    <h2 style="margin-top:40px;">관련 글</h2>
    <div class="related-grid">{related_html}</div>
  </article>
  <aside class="timeline-rail">
    <h2>목차</h2>
    <ol>{toc_html}</ol>
  </aside>
</div>
"""
    ld = [article_ld] + ([faq_ld] if faq_ld else [])
    return page(f"{p['title']} — {SITE['name']}", p["summary"], f"/posts/{p['slug']}/", "/categories/", body,
                og_type="article", json_ld=ld)

# ---------------------------------------------------------------------------
# 칼럼 목록/상세
# ---------------------------------------------------------------------------
def render_columns_list():
    cols = sorted(PUBLISHED_COLUMNS, key=lambda c: c["modified"], reverse=True)
    cards = "".join(post_card_html(c, "column") for c in cols)
    body = f"""
{breadcrumb_html([("홈","/"),("칼럼", None)])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">운영자 칼럼</span>
    <h1>{esc(SITE['owner_name'])}의 칼럼</h1>
    <p class="section-desc">정보형 글과는 결이 다른, 운영자의 관점과 최근 관찰을 담은 코너입니다.</p>
  </div>
</section>
<section class="section section-alt">
  <div class="wrap"><div class="card-grid">{cards}</div></div>
</section>
"""
    return page(f"칼럼 — {SITE['name']}", f"{SITE['owner_name']}가 쓰는 {SITE['name']}의 운영자 칼럼 목록입니다.",
                "/columns/", "/columns/", body)

def render_column_detail(c):
    paras = "".join(f"<p>{esc(par)}</p>" for par in c["body"])
    others = [x for x in PUBLISHED_COLUMNS if x["slug"] != c["slug"]][:3]
    related_html = "".join(post_card_html(o, "column") for o in others)
    article_ld = {
        "@context": "https://schema.org", "@type": "Article",
        "headline": c["title"], "description": c["summary"],
        "author": {"@type": "Person", "name": SITE["owner_name"]},
        "datePublished": c["published"], "dateModified": c["modified"],
        "publisher": {"@type": "Organization", "name": SITE["name"]},
    }
    body = f"""
{breadcrumb_html([("홈","/"),("칼럼","/columns/"),(c["title"], None)])}
<header class="post-header column-header wrap">
  <span class="tag tag-column">칼럼</span>
  <h1>{esc(c['title'])}</h1>
  <p class="post-subtitle">{esc(c['summary'])}</p>
  <div class="post-meta">
    <span>작성자 <strong>{esc(SITE['owner_name'])}</strong></span>
    <span>작성일 <strong>{fmt_date(c['published'])}</strong></span>
    <span>수정일 <strong>{fmt_date(c['modified'])}</strong></span>
  </div>
</header>
<div class="wrap post-layout" style="grid-template-columns:1fr;">
  <article class="post-body column-body" style="max-width:var(--measure);">
    {paras}
    <p class="update-note">이 칼럼은 운영자 개인의 관점을 담고 있으며, 사실 관계에 대한 정보는 다른 정보형 글을 함께 참고해 주세요.</p>
    <div class="editor-box">
      <span class="owner-seal" aria-hidden="true">{esc(SITE['owner_name'][0])}</span>
      <div><strong>{owner_link()}</strong><p>{esc(SITE['owner_bio'])}</p></div>
    </div>
    <h2 style="margin-top:40px;">다른 칼럼</h2>
    <div class="related-grid">{related_html}</div>
  </article>
</div>
"""
    return page(f"[칼럼] {c['title']} — {SITE['name']}", c["summary"], f"/columns/{c['slug']}/", "/columns/", body,
                og_type="article", json_ld=[article_ld])

# ---------------------------------------------------------------------------
# 운영자(author) 허브
# ---------------------------------------------------------------------------
def render_author():
    cols = sorted(PUBLISHED_COLUMNS, key=lambda c: c["modified"], reverse=True)
    cards = "".join(post_card_html(c, "column") for c in cols)
    body = f"""
{breadcrumb_html([("홈","/"),("운영자", None)])}
<section class="section">
  <div class="wrap author-hero">
    <span class="owner-seal" aria-hidden="true">{esc(SITE['owner_name'][0])}</span>
    <div>
      <span class="section-eyebrow">운영자 &middot; 편집자</span>
      <h1>{esc(SITE['owner_name'])}</h1>
      <p style="max-width:60ch;color:var(--ink-soft);">{esc(SITE['owner_bio'])}</p>
      <p id="author-state-text" style="font-weight:600;color:var(--brass-dark);">운영자가 정리한 칼럼을 읽어보세요.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a href="/admin/#column-new" class="btn btn-brass admin-cta">새 칼럼 작성하기</a>
        <a href="#column-list" class="btn btn-outline">칼럼 목록 보기</a>
        <a href="mailto:{SITE['email']}" class="btn btn-outline">이메일 보내기</a>
      </div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <span class="section-eyebrow">편집 원칙</span>
    <h2>콘텐츠를 만드는 기준</h2>
    <div class="principles" style="margin-top:20px;">
      <div class="principle"><h3>맥락 우선</h3><p>결과보다 원인과 배경을 먼저 설명합니다.</p></div>
      <div class="principle"><h3>담담한 서술</h3><p>확인되지 않은 정보나 자극적인 표현을 피합니다.</p></div>
      <div class="principle"><h3>주기적 점검</h3><p>발행된 글도 필요하면 다시 살펴보고 보완합니다.</p></div>
    </div>
  </div>
</section>

<section class="section" id="column-list">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">칼럼</span><h2>{esc(SITE['owner_name'])}이(가) 쓴 칼럼</h2></div>
    </div>
    <div class="card-grid">{cards}</div>
  </div>
</section>
"""
    json_ld = {"@context": "https://schema.org", "@type": "ProfilePage",
               "mainEntity": {"@type": "Person", "name": SITE["owner_name"], "description": SITE["owner_bio"]}}
    return page(f"운영자 소개 — {esc(SITE['owner_name'])} | {SITE['name']}",
                f"{SITE['name']} 운영자 {SITE['owner_name']}의 소개와 칼럼 목록입니다.",
                "/author/", "/author/", body, json_ld=json_ld)

# ---------------------------------------------------------------------------
# 소개(About)
# ---------------------------------------------------------------------------
def render_about():
    body = f"""
{breadcrumb_html([("홈","/"),("사이트 소개", None)])}
<section class="section">
  <div class="wrap prose">
    <span class="section-eyebrow">사이트 소개</span>
    <h1>{esc(SITE['name'])}는 이런 사이트입니다</h1>
    <p>{esc(SITE['name'])}는 {esc(SITE['audience'])}를 대상으로, 한국사와 세계사의 핵심 흐름을 쉬운 언어로 정리해 전달하는 정보 사이트입니다.
    특정 시험이나 자격을 위한 요약 노트가 아니라, 역사를 처음 접하거나 다시 관심을 갖게 된 분들이 편하게 읽을 수 있는 글을 지향합니다.</p>

    <h2>다루는 주제</h2>
    <ul>
      {''.join(f"<li><strong>{c['name']}</strong> — {esc(c['desc'])}</li>" for c in CATEGORIES)}
    </ul>

    <h2>편집 원칙</h2>
    <p>모든 글은 아래 원칙을 기준으로 작성하고 점검합니다.</p>
    <ol>
      <li>연도나 사건을 나열하기 전에, 그 일이 왜 일어났는지 배경을 먼저 설명합니다.</li>
      <li>확인되지 않은 최신 이슈나 검증되지 않은 통계는 다루지 않으며, 일반적으로 통용되는 정보를 중심으로 서술합니다.</li>
      <li>"완벽 정리", "무조건" 같은 과장된 표현 대신, 사실에 기반한 담담한 문체를 사용합니다.</li>
      <li>발행된 글도 필요하다고 판단되면 다시 검토하고 보완하며, 발행일과 수정일을 함께 표기합니다.</li>
    </ol>

    <h2>운영 방식</h2>
    <p>{esc(SITE['name'])}는 {owner_link()}이(가) 기획과 편집을 맡아 운영하고 있습니다. 정보형 글 외에 운영자의 관점을 담은
    <a href="/columns/">칼럼</a> 코너도 함께 운영합니다.</p>

    <div class="notice-band">이 사이트는 소규모로 운영되는 정보 사이트이며, 전문 연구 기관이나 학술 기관이 아닙니다.
    보다 정확하고 깊이 있는 내용이 필요하다면 관련 도서나 학술 자료를 함께 참고하시길 권장합니다.</div>

    <p><a href="/author/" class="btn btn-outline btn-sm">운영자 소개 자세히 보기 →</a></p>
  </div>
</section>
"""
    return page(f"사이트 소개 — {SITE['name']}", f"{SITE['name']}가 다루는 주제와 편집 원칙, 운영 방식을 소개합니다.",
                "/about/", "/about/", body)

# ---------------------------------------------------------------------------
# 문의하기
# ---------------------------------------------------------------------------
def render_contact():
    body = f"""
{breadcrumb_html([("홈","/"),("문의하기", None)])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">문의하기</span>
    <h1>궁금한 점이나 제안을 보내주세요</h1>
    <p class="section-desc" style="max-width:60ch;">오탈자 제보, 다루었으면 하는 주제 제안, 기타 문의 모두 이메일로 받고 있습니다.
    아래 폼을 작성해 보내주시거나, 이메일로 직접 연락해 주셔도 됩니다.</p>

    <div class="notice-band">이 문의 폼은 실제 메일 전송 기능이 연결되어 있지 않은 데모 화면입니다. 문의 내용은
    <a href="mailto:{SITE['email']}">{SITE['email']}</a>로 직접 보내주시면 확인 후 답변드립니다.</div>

    <form class="form-grid" id="contact-form" onsubmit="return false;">
      <div class="field"><label for="c-name">이름</label><input type="text" id="c-name" placeholder="홍길동"></div>
      <div class="field"><label for="c-email">답변받을 이메일</label><input type="email" id="c-email" placeholder="example@email.com"></div>
      <div class="field"><label for="c-subject">제목</label><input type="text" id="c-subject" placeholder="문의 제목을 입력해 주세요"></div>
      <div class="field"><label for="c-body">내용</label><textarea id="c-body" rows="6" placeholder="문의하실 내용을 자유롭게 작성해 주세요."></textarea></div>
      <a href="mailto:{SITE['email']}?subject=%5B{esc(SITE['name'])}%20문의%5D" class="btn btn-primary" style="width:fit-content;">이메일로 문의 보내기</a>
    </form>
  </div>
</section>
"""
    return page(f"문의하기 — {SITE['name']}", f"{SITE['name']}에 문의하거나 제안을 보내는 방법을 안내합니다.",
                "/contact/", "/contact/", body)

# ---------------------------------------------------------------------------
# 로그인 (관리자 전용)
# ---------------------------------------------------------------------------
def render_login():
    body = """
<section class="section">
  <div class="wrap" style="display:flex;justify-content:center;">
    <div class="login-card" style="max-width:400px;width:100%;">
      <h1>관리자 로그인</h1>
      <p style="color:var(--ink-faint);font-size:13.5px;margin-bottom:18px;">이 사이트의 콘텐츠는 관리자만 수정할 수 있습니다.</p>
      <form id="login-form" class="form-grid">
        <div class="field"><label for="login-pass">비밀번호</label><input type="password" id="login-pass" autocomplete="current-password" required></div>
        <button type="submit" class="btn btn-primary">로그인</button>
        <p id="login-error" class="login-error" hidden></p>
      </form>
      <p style="margin-top:18px;"><a href="/" style="color:var(--brass-dark);font-size:13px;">&larr; 사이트로 돌아가기</a></p>
    </div>
  </div>
</section>
"""
    html_doc = f"""<!DOCTYPE html>
<html lang="ko">
<head>
{head("관리자 로그인 — " + SITE['name'], "관리자 전용 로그인 페이지입니다.", "/login/", noindex=True)}
</head>
<body>
{header_html("/login/")}
<main id="main">
{body}
</main>
{footer_html()}
<script src="/assets/js/login.js"></script>
</body>
</html>"""
    return html_doc

# ---------------------------------------------------------------------------
# 정책 페이지 (개인정보처리방침 / 이용약관 / 면책고지)
# ---------------------------------------------------------------------------
def render_privacy():
    body = f"""
{breadcrumb_html([("홈","/"),("개인정보처리방침", None)])}
<section class="section">
  <div class="wrap prose">
    <span class="section-eyebrow">정책</span>
    <h1>개인정보처리방침</h1>
    <p>{esc(SITE['name'])}(이하 '사이트')는 이용자의 개인정보를 소중히 여기며, 관련 법령을 준수하기 위해 노력합니다.
    본 방침은 사이트가 어떤 정보를 어떻게 다루는지 설명합니다.</p>

    <h2>1. 수집하는 정보</h2>
    <p>사이트는 별도의 회원가입 기능을 운영하지 않습니다. 다만 이용자가 문의하기를 통해 이메일로 연락을 주시는 경우,
    그 과정에서 이용자가 자발적으로 제공한 이메일 주소와 문의 내용을 확인하게 됩니다.</p>

    <h2>2. 정보의 이용 목적</h2>
    <p>수집된 정보는 문의에 대한 답변, 사이트 운영과 관련된 소통 목적으로만 사용하며, 목적 외 용도로 사용하지 않습니다.</p>

    <h2>3. 정보의 보관 및 파기</h2>
    <p>이메일을 통해 접수된 문의 내용은 답변 처리를 위한 합리적인 기간 동안만 보관하며, 그 이후에는 별도의 요청이 없더라도
    지체 없이 파기하는 것을 원칙으로 합니다.</p>

    <h2>4. 쿠키 및 자동 수집 정보</h2>
    <p>사이트의 로그인 기능은 관리자 1인의 접근 인증을 위한 세션 쿠키를 사용합니다. 이 쿠키는 로그인 여부를 확인하는
    용도로만 사용되며, 일반 방문자를 식별하거나 추적하는 목적으로 사용되지 않습니다. 이 사이트는 회원가입 기능이
    없으며, 관리자 외 이용자의 로그인 정보를 별도로 수집·저장하지 않습니다.</p>

    <h2>5. 제3자 제공</h2>
    <p>사이트는 이용자의 정보를 광고주를 포함한 제3자에게 판매하거나 제공하지 않습니다.</p>

    <h2>6. 문의처</h2>
    <p>개인정보 관련 문의는 <a href="mailto:{SITE['email']}">{SITE['email']}</a>로 연락해 주시기 바랍니다.</p>

    <h2>7. 방침의 변경</h2>
    <p>본 방침은 관련 법령이나 사이트 운영 방식의 변화에 따라 개정될 수 있으며, 변경 시 이 페이지를 통해 안내합니다.</p>
  </div>
</section>
"""
    return page(f"개인정보처리방침 — {SITE['name']}", f"{SITE['name']}의 개인정보 수집, 이용, 보관에 관한 정책을 안내합니다.",
                "/privacy/", None, body, noindex=False)

def render_terms():
    body = f"""
{breadcrumb_html([("홈","/"),("이용약관", None)])}
<section class="section">
  <div class="wrap prose">
    <span class="section-eyebrow">정책</span>
    <h1>이용약관</h1>
    <p>본 약관은 {esc(SITE['name'])}(이하 '사이트')가 제공하는 콘텐츠 이용에 관한 기본적인 사항을 정합니다.</p>

    <h2>1. 콘텐츠의 성격</h2>
    <p>사이트에 게시된 글은 일반적인 정보 제공을 목적으로 하며, 전문적인 학술 자문이나 공식 견해를 대신하지 않습니다.
    보다 정확하거나 심층적인 내용이 필요한 경우 관련 도서, 논문, 공신력 있는 자료를 함께 참고하시길 권장합니다.</p>

    <h2>2. 저작권</h2>
    <p>사이트에 게시된 글, 이미지, 디자인 등 콘텐츠의 저작권은 별도의 표시가 없는 한 사이트 운영자에게 있습니다.
    사전 동의 없이 콘텐츠를 상업적으로 복제, 배포하는 것은 제한될 수 있습니다.</p>

    <h2>3. 이용자의 의무</h2>
    <p>이용자는 사이트를 이용함에 있어 관련 법령과 공서양속을 준수해야 하며, 사이트의 정상적인 운영을 방해하는 행위를
    해서는 안 됩니다.</p>

    <h2>4. 콘텐츠의 변경 및 중단</h2>
    <p>운영자는 콘텐츠의 오류를 바로잡거나 품질을 개선하기 위해 게시물을 수정, 보완할 수 있으며, 운영상의 필요에 따라
    일부 콘텐츠의 제공을 중단할 수 있습니다.</p>

    <h2>5. 면책</h2>
    <p>사이트의 콘텐츠는 신뢰할 수 있는 정보 전달을 목표로 작성되지만, 그 완전성이나 최신성을 절대적으로 보장하지는
    않습니다. 자세한 사항은 <a href="/disclaimer/">면책고지</a>를 참고해 주세요.</p>

    <h2>6. 약관의 변경</h2>
    <p>본 약관은 필요에 따라 개정될 수 있으며, 변경 시 이 페이지를 통해 안내합니다.</p>

    <h2>7. 문의</h2>
    <p>약관과 관련한 문의는 <a href="mailto:{SITE['email']}">{SITE['email']}</a>로 연락해 주시기 바랍니다.</p>
  </div>
</section>
"""
    return page(f"이용약관 — {SITE['name']}", f"{SITE['name']} 콘텐츠 이용에 관한 기본 약관을 안내합니다.",
                "/terms/", None, body)

def render_disclaimer():
    body = f"""
{breadcrumb_html([("홈","/"),("면책고지", None)])}
<section class="section">
  <div class="wrap prose">
    <span class="section-eyebrow">정책</span>
    <h1>면책고지</h1>
    <p>{esc(SITE['name'])}는 {esc(SITE['audience'])}를 위해 역사 관련 정보를 알기 쉽게 정리해 제공하는 개인 운영 정보
    사이트입니다. 아래 내용을 참고해 주시기 바랍니다.</p>

    <h2>1. 정보의 성격</h2>
    <p>사이트에 게시된 글은 일반적으로 통용되는 역사적 사실과 해석을 바탕으로 작성한 정보성 콘텐츠이며, 학술 논문이나
    공식 감수를 거친 자료가 아닙니다. 역사적 사건에 대한 해석은 연구자나 자료에 따라 다를 수 있습니다.</p>

    <h2>2. 정확성에 대한 한계</h2>
    <p>운영자는 정확한 정보를 전달하기 위해 노력하지만, 일부 내용에 오류나 시각의 편차가 있을 수 있습니다. 보다
    정확한 확인이 필요한 내용은 관련 도서나 공신력 있는 자료를 함께 참고해 주시기 바랍니다.</p>

    <h2>3. 콘텐츠 이용에 따른 책임</h2>
    <p>사이트의 정보를 활용해 내린 판단이나 그로 인해 발생하는 결과에 대해, 운영자는 법령이 허용하는 범위 내에서
    책임을 지지 않습니다.</p>

    <h2>4. 오류 제보</h2>
    <p>내용에서 사실과 다른 부분을 발견하시면 <a href="mailto:{SITE['email']}">{SITE['email']}</a>로 알려주시기
    바랍니다. 확인 후 필요한 경우 수정하겠습니다.</p>

    <h2>5. 외부 링크</h2>
    <p>사이트에는 참고를 위한 외부 링크가 포함될 수 있으며, 외부 사이트의 콘텐츠에 대해서는 운영자가 관리 권한을
    갖지 않습니다.</p>
  </div>
</section>
"""
    return page(f"면책고지 — {SITE['name']}", f"{SITE['name']} 콘텐츠의 성격과 정확성에 관한 면책 사항을 안내합니다.",
                "/disclaimer/", None, body)

# ---------------------------------------------------------------------------
# 404
# ---------------------------------------------------------------------------
def render_404():
    body = f"""
<div class="wrap error-page">
  <span class="code">404 NOT FOUND</span>
  <h1>페이지를 찾을 수 없습니다</h1>
  <p style="color:var(--ink-soft);max-width:50ch;margin:0 auto 26px;">주소가 변경되었거나 삭제된 페이지일 수 있습니다.
  아래에서 원하는 정보를 다시 찾아보세요.</p>
  <div class="hero-actions" style="justify-content:center;">
    <a href="/" class="btn btn-primary">홈으로 가기</a>
    <a href="/categories/" class="btn btn-outline">카테고리 보기</a>
    <a href="/sitemap/" class="btn btn-outline">사이트맵 보기</a>
  </div>
</div>
"""
    return page(f"페이지를 찾을 수 없습니다 — {SITE['name']}", "요청하신 페이지를 찾을 수 없습니다.", "/404.html", None, body, noindex=True)

# ---------------------------------------------------------------------------
# HTML 사이트맵
# ---------------------------------------------------------------------------
def render_sitemap_html():
    post_links = "".join(f'<li><a href="/posts/{p["slug"]}/">{esc(p["title"])}</a></li>' for p in sorted(PUBLISHED_POSTS, key=lambda p: p["published"]))
    col_links = "".join(f'<li><a href="/columns/{c["slug"]}/">{esc(c["title"])}</a></li>' for c in sorted(PUBLISHED_COLUMNS, key=lambda c: c["published"]))
    cat_links = "".join(f'<li><a href="/categories/{c["slug"]}/">{c["name"]}</a></li>' for c in CATEGORIES)
    body = f"""
{breadcrumb_html([("홈","/"),("사이트맵", None)])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">사이트맵</span>
    <h1>전체 페이지 한눈에 보기</h1>
    <div class="sitemap-grid" style="margin-top:24px;">
      <div>
        <h2>카테고리</h2>
        <ul>{cat_links}</ul>
        <h2 style="margin-top:24px;">사이트 정보</h2>
        <ul>
          <li><a href="/about/">사이트 소개</a></li>
          <li><a href="/author/">운영자 소개</a></li>
          <li><a href="/contact/">문의하기</a></li>
          <li><a href="/privacy/">개인정보처리방침</a></li>
          <li><a href="/terms/">이용약관</a></li>
          <li><a href="/disclaimer/">면책고지</a></li>
        </ul>
      </div>
      <div>
        <h2>전체 글 ({len(PUBLISHED_POSTS)})</h2>
        <ul>{post_links}</ul>
        <h2 style="margin-top:24px;">전체 칼럼 ({len(PUBLISHED_COLUMNS)})</h2>
        <ul>{col_links}</ul>
      </div>
    </div>
  </div>
</section>
"""
    return page(f"사이트맵 — {SITE['name']}", f"{SITE['name']}의 모든 페이지를 한눈에 볼 수 있는 사이트맵입니다.",
                "/sitemap/", None, body)

# ---------------------------------------------------------------------------
# 관리자(admin) 셸 — 실제 UI는 admin.js가 렌더링
# ---------------------------------------------------------------------------
def render_admin():
    body_html = '<div id="admin-root"></div>'
    html_doc = f"""<!DOCTYPE html>
<html lang="ko">
<head>
{head("관리자 모드 — " + SITE['name'], "관리자 전용 콘텐츠 관리 화면입니다.", "/admin/", noindex=True)}
</head>
<body>
{body_html}
<script src="/data/site.config.js"></script>
<script src="/data/categories.js"></script>
<script src="/data/posts.js"></script>
<script src="/data/columns.js"></script>
<script src="/assets/js/common.js"></script>
<script src="/assets/js/admin.js"></script>
</body>
</html>"""
    return html_doc

# ---------------------------------------------------------------------------
# data/*.js — 단일 소스(admin 데모 시딩용) + 사이트 전체 콘텐츠 데이터 파일
# ---------------------------------------------------------------------------
def posts_for_js():
    # admin 데모의 초기 시드 데이터입니다. 초안(draft)도 포함해 admin에서 보이게 합니다.
    out = []
    for p in POSTS:
        out.append({
            "slug": p["slug"], "title": p["title"], "subtitle": p.get("subtitle", ""),
            "category": p["category"], "summary": p.get("summary", ""),
            "published": p["published"], "modified": p["modified"],
            "featured": p.get("featured", False), "status": p.get("status", "published"),
            "toc": p.get("toc") or [h for h, _ in p.get("body", [])],
            "body": p.get("body", []), "key_points": p.get("key_points", []),
            "mistakes": p.get("mistakes", []), "checklist": p.get("checklist", []),
            "related": p.get("related", []), "faq": p.get("faq", []),
        })
    return out

def columns_for_js():
    out = []
    for c in COLUMNS:
        out.append({
            "slug": c["slug"], "title": c["title"], "summary": c.get("summary", ""),
            "published": c["published"], "modified": c["modified"],
            "featured": c.get("featured", False), "status": c.get("status", "published"),
            "body_paragraphs": c.get("body", []),
        })
    return out

def write_data_files():
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "site.config.js"), "w", encoding="utf-8") as f:
        f.write("// 사이트 전역 설정 — 이 파일 하나만 고치면 사이트명/색상/운영자 정보가 함께 바뀝니다.\n")
        f.write("window.HN_SEED = window.HN_SEED || {};\n")
        f.write("window.HN_SEED.config = " + json.dumps(SITE, ensure_ascii=False, indent=2) + ";\n")
        f.write("window.HN_SITE_CONFIG = window.HN_SEED.config;\n")

    with open(os.path.join(ROOT, "data", "categories.js"), "w", encoding="utf-8") as f:
        f.write("// 카테고리 데이터\n")
        f.write("window.HN_SEED = window.HN_SEED || {};\n")
        f.write("window.HN_SEED.categories = " + json.dumps(CATEGORIES, ensure_ascii=False, indent=2) + ";\n")
        f.write("window.HN_CATEGORIES = window.HN_SEED.categories;\n")

    with open(os.path.join(ROOT, "data", "posts.js"), "w", encoding="utf-8") as f:
        f.write("// 일반 글 데이터 (관리자 데모 화면의 초기 시드 데이터로도 사용됩니다)\n")
        f.write("window.HN_SEED = window.HN_SEED || {};\n")
        f.write("window.HN_SEED.posts = " + json.dumps(posts_for_js(), ensure_ascii=False, indent=2) + ";\n")
        f.write("window.HN_POSTS = window.HN_SEED.posts;\n")

    with open(os.path.join(ROOT, "data", "columns.js"), "w", encoding="utf-8") as f:
        f.write("// 운영자 칼럼 데이터\n")
        f.write("window.HN_SEED = window.HN_SEED || {};\n")
        f.write("window.HN_SEED.columns = " + json.dumps(columns_for_js(), ensure_ascii=False, indent=2) + ";\n")
        f.write("window.HN_COLUMNS = window.HN_SEED.columns;\n")

# ---------------------------------------------------------------------------
# robots.txt / sitemap.xml
# ---------------------------------------------------------------------------
def write_robots():
    content = f"""User-agent: *
Allow: /
Disallow: /admin/

Sitemap: {SITE['url'].rstrip('/')}/sitemap.xml
"""
    with open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(content)

def write_sitemap_xml():
    urls = ["/", "/about/", "/author/", "/contact/", "/categories/", "/columns/",
            "/privacy/", "/terms/", "/disclaimer/", "/sitemap/"]
    for c in CATEGORIES:
        urls.append(f"/categories/{c['slug']}/")
    for p in PUBLISHED_POSTS:
        urls.append(f"/posts/{p['slug']}/")
    for c in PUBLISHED_COLUMNS:
        urls.append(f"/columns/{c['slug']}/")

    def lastmod_for(u):
        for p in PUBLISHED_POSTS:
            if u == f"/posts/{p['slug']}/":
                return p["modified"]
        for c in PUBLISHED_COLUMNS:
            if u == f"/columns/{c['slug']}/":
                return c["modified"]
        return "2026-08-01"

    items = "\n".join(
        f'  <url><loc>{SITE["url"].rstrip("/")}{u}</loc><lastmod>{lastmod_for(u)}</lastmod></url>'
        for u in urls
    )
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{items}\n</urlset>\n'
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(xml)

# ---------------------------------------------------------------------------
# 메인 빌드
# ---------------------------------------------------------------------------
def build():
    write_page("/", render_home())
    write_page("/about", render_about())
    write_page("/author", render_author())
    write_page("/contact", render_contact())
    write_page("/login", render_login())
    write_page("/categories", render_categories_list())
    for c in CATEGORIES:
        write_page(f"/categories/{c['slug']}", render_category_detail(c))
    for p in PUBLISHED_POSTS:
        write_page(f"/posts/{p['slug']}", render_post_detail(p))
    write_page("/columns", render_columns_list())
    for c in PUBLISHED_COLUMNS:
        write_page(f"/columns/{c['slug']}", render_column_detail(c))
    write_page("/privacy", render_privacy())
    write_page("/terms", render_terms())
    write_page("/disclaimer", render_disclaimer())
    write_page("/sitemap", render_sitemap_html())

    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8") as f:
        f.write(render_404())

    os.makedirs(os.path.join(ROOT, "admin"), exist_ok=True)
    with open(os.path.join(ROOT, "admin", "index.html"), "w", encoding="utf-8") as f:
        f.write(render_admin())

    write_data_files()
    write_robots()
    write_sitemap_xml()

    print("빌드 완료")
    print("posts:", len(POSTS), "columns:", len(COLUMNS), "categories:", len(CATEGORIES))

if __name__ == "__main__":
    build()
