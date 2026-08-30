// scripts/build.py를 그대로 JS로 옮긴 렌더링 엔진.
// 정적 파일을 미리 만들어두는 대신, 요청이 올 때마다 D1에서 읽은 데이터로
// 이 함수들이 그 자리에서 HTML을 만든다. 그래서 관리자가 "저장"하면
// 커밋/재배포 없이 바로 다음 요청부터 반영된다.
// 출력 HTML은 build.py가 만들던 것과 최대한 동일하게 맞췄다.

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(d) {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${y}.${m}.${dd}`;
}

const FIRST_IMG_RE = /<img[^>]+src="([^"]+)"/i;
function firstImage(bodyHtml) {
  if (!bodyHtml) return null;
  const m = FIRST_IMG_RE.exec(bodyHtml);
  return m ? m[1] : null;
}

function isPublished(item) {
  return (item.status || "published") !== "draft";
}

const HEADING_RE = /<h([1-3])((?:\s+[^>]*)?)>([\s\S]*?)<\/h\1>/gi;
const TAG_RE = /<[^>]+>/g;

function processRichBody(htmlStr) {
  const toc = [];
  let idx = 0;
  const newHtml = (htmlStr || "").replace(HEADING_RE, (match, level, attrs, inner) => {
    const text = inner.replace(TAG_RE, "").trim();
    toc.push(text);
    const attrsClean = attrs.replace(/\s+id="[^"]*"/, "");
    const i = idx++;
    return `<h${level}${attrsClean} id="sec-${i}">${inner}</h${level}>`;
  });
  return { html: newHtml, toc };
}

function cat(ctx, slug) {
  return ctx.CATEGORIES.find((c) => c.slug === slug) || { slug, name: slug, desc: "" };
}

function postBySlug(ctx, slug) {
  return ctx.PUBLISHED_POSTS.find((p) => p.slug === slug) || null;
}

function colBySlug(ctx, slug) {
  return ctx.PUBLISHED_COLUMNS.find((c) => c.slug === slug) || null;
}

function postsInCat(ctx, catSlug) {
  return ctx.PUBLISHED_POSTS.filter((p) => p.category === catSlug);
}

function latestPosts(ctx, n = 6) {
  return [...ctx.PUBLISHED_POSTS].sort((a, b) => (b.modified || "").localeCompare(a.modified || "")).slice(0, n);
}

function featuredPosts(ctx, n = 4) {
  let fs = ctx.PUBLISHED_POSTS.filter((p) => p.featured);
  fs = fs.sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));
  if (fs.length < n) {
    const rest = ctx.PUBLISHED_POSTS.filter((p) => !fs.includes(p));
    fs = fs.concat([...rest].sort((a, b) => (b.modified || "").localeCompare(a.modified || "")).slice(0, n - fs.length));
  }
  return fs.slice(0, n);
}

// ---------------------------------------------------------------------------
// 공통 레이아웃
// ---------------------------------------------------------------------------
const NAV_ITEMS = [
  ["/", "홈"],
  ["/categories/", "카테고리"],
  ["/columns/", "칼럼"],
  ["/about/", "사이트 소개"],
  ["/author/", "운영자"],
  ["/contact/", "문의"],
];

function ownerLink(ctx, cls = "") {
  return `<a href="/author/" class="owner-link ${cls}">${esc(ctx.SITE.owner_name)}</a>`;
}

function head(ctx, title, description, canonicalPath, ogType = "website", jsonLd = null, noindex = false) {
  const canonical = ctx.SITE.url.replace(/\/+$/, "") + canonicalPath;
  const robots = noindex ? "noindex,follow" : "index,follow";
  const ldBlock = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(Array.isArray(jsonLd) ? jsonLd : jsonLd)}</script>`
    : "";
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(ctx.SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600;700&family=Noto+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4813061242876854"
     crossorigin="anonymous"></script>
${ldBlock}`;
}

function breadcrumbHtml(ctx, items) {
  const lis = [];
  const ldItems = [];
  items.forEach(([label, path], i) => {
    const pos = i + 1;
    if (path) {
      lis.push(`<li><a href="${path}">${esc(label)}</a></li>`);
      ldItems.push({ "@type": "ListItem", position: pos, name: label, item: ctx.SITE.url.replace(/\/+$/, "") + path });
    } else {
      lis.push(`<li aria-current="page">${esc(label)}</li>`);
      ldItems.push({ "@type": "ListItem", position: pos, name: label });
    }
  });
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: ldItems };
  return `<nav class="breadcrumb" aria-label="브레드크럼"><ol>${lis.join("")}</ol></nav><script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

function headerHtml(ctx, active = "/") {
  const links = NAV_ITEMS.map(([path, label]) => {
    const cls = path === active ? ' class="active"' : "";
    if (path === "/categories/") {
      const catLinks = ctx.CATEGORIES.map((c) => `<li><a href="/categories/${c.slug}/">${esc(c.name)}</a></li>`).join("");
      return `<li class="has-dropdown"><a href="${path}"${cls}>${label}</a><ul class="nav-dropdown">${catLinks}</ul></li>`;
    }
    return `<li><a href="${path}"${cls}>${label}</a></li>`;
  }).join("");
  return `<a class="skip-link" href="#main">본문 바로가기</a>
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
        <strong>${esc(ctx.SITE.name)}</strong>
        <small>${esc(ctx.SITE.tagline)}</small>
      </span>
    </a>
    <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="site-nav">
      <span></span><span></span><span></span>
      <span class="sr-only">메뉴 열기</span>
    </button>
    <nav class="site-nav" id="site-nav">
      <ul>${links}<li><a href="/login/" class="nav-login reader-cta">로그인</a></li></ul>
    </nav>
  </div>
</header>`;
}

function footerHtml(ctx) {
  const catLinks = ctx.CATEGORIES.map((c) => `<li><a href="/categories/${c.slug}/">${esc(c.name)}</a></li>`).join("");
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <span class="brand-mark" aria-hidden="true">HN</span>
      <p><strong>${esc(ctx.SITE.name)}</strong><br>${esc(ctx.SITE.tagline)}</p>
      <p class="footer-owner">운영자 ${ownerLink(ctx)} · <a href="mailto:${ctx.SITE.email}">${esc(ctx.SITE.email)}</a></p>
    </div>
    <div class="footer-col">
      <h2>카테고리</h2>
      <ul>${catLinks}</ul>
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
    <p>&copy; 2026 ${esc(ctx.SITE.name)}. 이 사이트의 모든 글은 운영자 ${ownerLink(ctx)} 및 필진이 작성했습니다.</p>
    <p class="footer-contact">문의: <a href="mailto:${ctx.SITE.email}">${esc(ctx.SITE.email)}</a></p>
  </div>
</footer>
<script src="/assets/js/common.js"></script>`;
}

function page(ctx, title, description, canonicalPath, activeNav, bodyHtml, opts = {}) {
  const { ogType = "website", jsonLd = null, noindex = false, bodyClass = "" } = opts;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
${head(ctx, title, description, canonicalPath, ogType, jsonLd, noindex)}
</head>
<body class="${bodyClass}">
${headerHtml(ctx, activeNav)}
<main id="main">
${bodyHtml}
</main>
${footerHtml(ctx)}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 카드 컴포넌트
// ---------------------------------------------------------------------------
function postCardHtml(ctx, p, kind = "post") {
  const isCol = kind === "column";
  const href = isCol ? `/columns/${p.slug}/` : `/posts/${p.slug}/`;
  const tag = isCol
    ? `<span class="tag tag-column">칼럼</span>`
    : `<span class="tag" data-cat="${esc(p.category)}">${esc(cat(ctx, p.category).name)}</span>`;
  const feat = p.featured ? ' <span class="tag tag-featured">추천</span>' : "";

  const thumbUrl = isCol ? null : firstImage(p.body_html);
  let thumbHtml;
  if (thumbUrl) {
    thumbHtml = `<div class="post-card-thumb" style="background-image:url('${esc(thumbUrl)}')"></div>`;
  } else {
    const initial = esc((isCol ? ctx.SITE.name : cat(ctx, p.category).name).slice(0, 1));
    thumbHtml = `<div class="post-card-thumb post-card-thumb-placeholder"><span>${initial}</span></div>`;
  }

  return `<a class="post-card" href="${href}">
  ${thumbHtml}
  <div class="post-card-body">
    ${tag}${feat}
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.summary || "")}</p>
    <div class="card-meta"><span>${fmtDate(p.published)}</span><span>수정 ${fmtDate(p.modified)}</span></div>
  </div>
</a>`;
}

// ---------------------------------------------------------------------------
// 홈
// ---------------------------------------------------------------------------
function renderHome(ctx) {
  const latest = latestPosts(ctx, 6);
  const feats = featuredPosts(ctx, 4);
  const catChips = ctx.CATEGORIES.map((c, i) => (
    `<div class="cat-chip"><span class="idx">${String(i + 1).padStart(2, "0")}</span><h3><a href="/categories/${c.slug}/">${esc(c.name)}</a></h3><p>${esc((c.desc || "").slice(0, 44))}…</p></div>`
  )).join("");
  const latestHtml = latest.map((p) => postCardHtml(ctx, p)).join("");
  const featHtml = feats.map((p) => postCardHtml(ctx, p)).join("");
  const colPreview = [...ctx.PUBLISHED_COLUMNS].sort((a, b) => (b.modified || "").localeCompare(a.modified || "")).slice(0, 3)
    .map((c) => postCardHtml(ctx, c, "column")).join("");

  const heroImage = ctx.SITE.hero_image_url || "";
  const heroCls = heroImage ? "hero hero-has-image" : "hero";
  const heroStyle = heroImage ? ` style="--hero-image:url('${esc(heroImage)}')"` : "";

  const body = `
<section class="${heroCls}"${heroStyle}>
  <div class="hero-inner">
    <span class="hero-eyebrow">${esc(ctx.SITE.topic)} 정보 사이트</span>
    <h1>${esc(ctx.SITE.tagline)}</h1>
    <p class="hero-lead">${esc(ctx.SITE.name)}는 ${esc(ctx.SITE.audience)}를 위해, 한국사와 세계사의 핵심 흐름과 인물, 사건을 쉬운 언어로 정리해 전달하는 정보 사이트입니다.</p>
    <div class="hero-actions">
      <a href="/categories/" class="btn btn-primary">카테고리 둘러보기</a>
      <a href="/columns/" class="btn btn-outline">운영자 칼럼 보기</a>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">최신 글</span><h2>최근에 정리한 글</h2></div>
      <a class="see-all" href="/sitemap/">전체 글 목록 보기 →</a>
    </div>
    <div class="card-grid">${latestHtml}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">대표 카테고리</span><h2>어디서부터 읽어도 좋습니다</h2></div>
      <a class="see-all" href="/categories/">전체 카테고리 보기 →</a>
    </div>
    <div class="cat-strip">${catChips}</div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">추천 글</span><h2>입문자에게 먼저 추천하는 글</h2></div>
    </div>
    <div class="card-grid">${featHtml}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">칼럼</span><h2>운영자 칼럼 미리 보기</h2></div>
      <a class="see-all" href="/columns/">칼럼 전체 보기 →</a>
    </div>
    <div class="card-grid">${colPreview}</div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">운영자</span><h2>누가 이 글들을 쓰고 있나요</h2></div>
    </div>
    <div class="owner-box">
      <span class="owner-seal" aria-hidden="true">${esc(ctx.SITE.owner_name.slice(0, 1))}</span>
      <div>
        <span class="role">운영자 · 편집자</span>
        <h3>${ownerLink(ctx)}</h3>
        <p>${esc(ctx.SITE.owner_bio)}</p>
        <a href="/author/" class="btn btn-outline btn-sm">운영자 소개와 칼럼 보러 가기</a>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head">
      <div><span class="section-eyebrow">운영 목적</span><h2>${esc(ctx.SITE.name)}가 만들어진 이유</h2></div>
    </div>
    <p class="section-desc" style="max-width:70ch;">역사는 흥미롭지만, 처음 접할 때는 정보가 너무 많거나 지나치게 압축되어 있어 오히려 진입장벽처럼 느껴지곤 합니다.
    ${esc(ctx.SITE.name)}는 연도와 사건을 나열하기보다, 왜 그런 일이 벌어졌는지 맥락을 먼저 설명하는 것을 목표로 합니다.</p>
    <div class="principles" style="margin-top:28px;">
      <div class="principle"><h3>맥락을 우선합니다</h3><p>사건의 결과보다 원인과 배경을 먼저 설명해 흐름이 자연스럽게 이어지도록 씁니다.</p></div>
      <div class="principle"><h3>과장하지 않습니다</h3><p>확인되지 않은 최신 이슈나 자극적인 표현 대신, 검증 가능한 범위 안에서 담담하게 서술합니다.</p></div>
      <div class="principle"><h3>꾸준히 점검합니다</h3><p>발행된 글도 필요하면 다시 살펴보고 보완하며, 발행일과 수정일을 함께 표시합니다.</p></div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap" style="text-align:center;">
    <h2 style="margin-bottom:12px;">궁금한 점이나 제안이 있으신가요?</h2>
    <p class="section-desc" style="margin:0 auto 20px;">다루었으면 하는 주제, 잘못된 내용에 대한 제보 모두 이메일로 받고 있습니다.</p>
    <a href="/contact/" class="btn btn-primary">문의하기</a>
  </div>
</section>
`;
  const jsonLd = { "@context": "https://schema.org", "@type": "WebSite", name: ctx.SITE.name, url: ctx.SITE.url, description: ctx.SITE.tagline };
  return page(ctx, `${ctx.SITE.name} — ${ctx.SITE.tagline}`,
    `${ctx.SITE.name}는 ${ctx.SITE.audience}를 위한 ${ctx.SITE.topic} 정보 사이트입니다. 한국사와 세계사의 핵심 주제를 쉬운 언어로 정리해 전달합니다.`,
    "/", "/", body, { jsonLd });
}

// ---------------------------------------------------------------------------
// 카테고리 목록/상세
// ---------------------------------------------------------------------------
function renderCategoriesList(ctx) {
  const chips = ctx.CATEGORIES.map((c, i) => `
    <div class="cat-chip">
      <span class="idx">${String(i + 1).padStart(2, "0")}</span>
      <h3><a href="/categories/${c.slug}/">${esc(c.name)}</a></h3>
      <p>${esc(c.desc)}</p>
      <p style="margin-top:8px;font-size:12.5px;color:var(--brass-dark);">${postsInCat(ctx, c.slug).length}개의 글</p>
    </div>`).join("");
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["카테고리", null]])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">카테고리</span>
    <h1>${esc(ctx.SITE.name)}의 주제 구조</h1>
    <p class="section-desc">아래 다섯 개 카테고리를 중심으로 콘텐츠를 운영하고 있습니다. 관심 있는 주제부터 편하게 살펴보세요.</p>
    <div class="cat-strip" style="grid-template-columns:repeat(3,1fr);margin-top:28px;">${chips}</div>
  </div>
</section>
`;
  return page(ctx, "카테고리 전체 보기", `${ctx.SITE.name}의 대표 카테고리 목록입니다. 한국사, 세계사, 인물, 전쟁과 사건, 유물과 문화유산 등 주제별로 글을 찾아볼 수 있습니다.`,
    "/categories/", "/categories/", body);
}

function renderCategoryDetail(ctx, c) {
  const posts = [...postsInCat(ctx, c.slug)].sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));
  const cards = posts.map((p) => postCardHtml(ctx, p)).join("");
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["카테고리", "/categories/"], [c.name, null]])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">카테고리</span>
    <h1>${esc(c.name)}</h1>
    <p class="section-desc">${esc(c.desc)}</p>
  </div>
</section>
<section class="section section-alt">
  <div class="wrap">
    <div class="card-grid">${cards}</div>
  </div>
</section>
`;
  const jsonLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: c.name, description: c.desc };
  return page(ctx, `${c.name} — ${ctx.SITE.name}`, `${c.desc} ${ctx.SITE.name}에서 ${c.name} 관련 글 ${posts.length}개를 확인해 보세요.`,
    `/categories/${c.slug}/`, "/categories/", body, { jsonLd });
}

// ---------------------------------------------------------------------------
// 글 상세
// ---------------------------------------------------------------------------
function renderPostDetail(ctx, p) {
  const c = cat(ctx, p.category);
  let bodySections, tocSource;
  if (p.body_html) {
    const processed = processRichBody(p.body_html);
    bodySections = processed.html;
    tocSource = processed.toc;
  } else {
    const body = p.body || [];
    tocSource = p.toc && p.toc.length ? p.toc : body.map(([h]) => h);
    bodySections = body.map(([h, pars], i) => `<h2 id="sec-${i}">${esc(h)}</h2>` + pars.map((par) => `<p>${esc(par)}</p>`).join("")).join("");
  }
  const tocHtml = tocSource.map((h, i) => `<li><a href="#sec-${i}">${esc(h)}</a></li>`).join("");

  const keyPointsList = p.key_points || [];
  const mistakesList = p.mistakes || [];
  const checklistList = p.checklist || [];
  const keyPoints = keyPointsList.map((k) => `<li>${esc(k)}</li>`).join("");
  const mistakes = mistakesList.map((k) => `<li>${esc(k)}</li>`).join("");
  const checklist = checklistList.map((k, i) => `<li><input type="checkbox" id="chk-${i}"><label for="chk-${i}">${esc(k)}</label></li>`).join("");
  const summaryBox = keyPointsList.length ? `<div class="box box-summary"><h3>핵심 요약</h3><ul>${keyPoints}</ul></div>` : "";
  const mistakeBox = mistakesList.length ? `<div class="box box-mistake"><h3>초보자가 자주 하는 실수</h3><ul>${mistakes}</ul></div>` : "";
  const checklistBox = checklistList.length ? `<div class="box"><h3>정리 체크리스트</h3><ul class="checklist">${checklist}</ul></div>` : "";

  const relatedPosts = (p.related || []).map((s) => postBySlug(ctx, s)).filter(Boolean);
  const relatedHtml = relatedPosts.map((r) => postCardHtml(ctx, r)).join("");

  let faqHtml = "";
  let faqLd = null;
  if (p.faq && p.faq.length) {
    faqHtml = '<div class="box"><h3>자주 묻는 질문</h3>' +
      p.faq.map(([q, a]) => `<details class="faq-item"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("") +
      "</div>";
    faqLd = {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: p.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    };
  }

  const articleLd = {
    "@context": "https://schema.org", "@type": "Article",
    headline: p.title, description: p.summary,
    author: { "@type": "Person", name: ctx.SITE.owner_name },
    datePublished: p.published, dateModified: p.modified,
    publisher: { "@type": "Organization", name: ctx.SITE.name },
  };

  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["카테고리", "/categories/"], [c.name, `/categories/${c.slug}/`], [p.title, null]])}
<header class="post-header wrap">
  <span class="tag">${esc(c.name)}</span>
  <h1>${esc(p.title)}</h1>
  <p class="post-subtitle">${esc(p.subtitle)}</p>
  <div class="post-meta">
    <span>작성자 <strong>${esc(ctx.SITE.owner_name)}</strong></span>
    <span>작성일 <strong>${fmtDate(p.published)}</strong></span>
    <span>수정일 <strong>${fmtDate(p.modified)}</strong></span>
  </div>
</header>
<div class="wrap post-layout">
  <article class="post-body">
    ${bodySections}
    ${summaryBox}
    ${mistakeBox}
    ${checklistBox}
    ${faqHtml}
    <p class="update-note">이 글은 초보자 기준으로 이해하기 쉽게 정리되었으며, 내용은 운영 과정에서 순차적으로 보완될 수 있습니다.</p>
    <div class="editor-box">
      <span class="owner-seal" aria-hidden="true">${esc(ctx.SITE.owner_name.slice(0, 1))}</span>
      <div><strong>${ownerLink(ctx)}</strong><p>${esc(ctx.SITE.owner_bio)}</p></div>
    </div>
    <h2 style="margin-top:40px;">관련 글</h2>
    <div class="related-grid">${relatedHtml}</div>
  </article>
  <aside class="timeline-rail">
    <h2>목차</h2>
    <ol>${tocHtml}</ol>
  </aside>
</div>
`;
  const ld = faqLd ? [articleLd, faqLd] : [articleLd];
  return page(ctx, `${p.title} — ${ctx.SITE.name}`, p.summary, `/posts/${p.slug}/`, "/categories/", body, { ogType: "article", jsonLd: ld });
}

// ---------------------------------------------------------------------------
// 칼럼 목록/상세
// ---------------------------------------------------------------------------
function renderColumnsList(ctx) {
  const cols = [...ctx.PUBLISHED_COLUMNS].sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));
  const cards = cols.map((c) => postCardHtml(ctx, c, "column")).join("");
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["칼럼", null]])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">운영자 칼럼</span>
    <h1>${esc(ctx.SITE.owner_name)}의 칼럼</h1>
    <p class="section-desc">정보형 글과는 결이 다른, 운영자의 관점과 최근 관찰을 담은 코너입니다.</p>
  </div>
</section>
<section class="section section-alt">
  <div class="wrap"><div class="card-grid">${cards}</div></div>
</section>
`;
  return page(ctx, `칼럼 — ${ctx.SITE.name}`, `${ctx.SITE.owner_name}가 쓰는 ${ctx.SITE.name}의 운영자 칼럼 목록입니다.`, "/columns/", "/columns/", body);
}

function renderColumnDetail(ctx, c) {
  let paras;
  if (c.body_html) {
    paras = processRichBody(c.body_html).html;
  } else {
    paras = (c.body || []).map((par) => `<p>${esc(par)}</p>`).join("");
  }
  const others = ctx.PUBLISHED_COLUMNS.filter((x) => x.slug !== c.slug).slice(0, 3);
  const relatedHtml = others.map((o) => postCardHtml(ctx, o, "column")).join("");
  const articleLd = {
    "@context": "https://schema.org", "@type": "Article",
    headline: c.title, description: c.summary,
    author: { "@type": "Person", name: ctx.SITE.owner_name },
    datePublished: c.published, dateModified: c.modified,
    publisher: { "@type": "Organization", name: ctx.SITE.name },
  };
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["칼럼", "/columns/"], [c.title, null]])}
<header class="post-header column-header wrap">
  <span class="tag tag-column">칼럼</span>
  <h1>${esc(c.title)}</h1>
  <p class="post-subtitle">${esc(c.summary)}</p>
  <div class="post-meta">
    <span>작성자 <strong>${esc(ctx.SITE.owner_name)}</strong></span>
    <span>작성일 <strong>${fmtDate(c.published)}</strong></span>
    <span>수정일 <strong>${fmtDate(c.modified)}</strong></span>
  </div>
</header>
<div class="wrap post-layout" style="grid-template-columns:1fr;">
  <article class="post-body column-body" style="max-width:var(--measure);">
    ${paras}
    <p class="update-note">이 칼럼은 운영자 개인의 관점을 담고 있으며, 사실 관계에 대한 정보는 다른 정보형 글을 함께 참고해 주세요.</p>
    <div class="editor-box">
      <span class="owner-seal" aria-hidden="true">${esc(ctx.SITE.owner_name.slice(0, 1))}</span>
      <div><strong>${ownerLink(ctx)}</strong><p>${esc(ctx.SITE.owner_bio)}</p></div>
    </div>
    <h2 style="margin-top:40px;">다른 칼럼</h2>
    <div class="related-grid">${relatedHtml}</div>
  </article>
</div>
`;
  return page(ctx, `[칼럼] ${c.title} — ${ctx.SITE.name}`, c.summary, `/columns/${c.slug}/`, "/columns/", body, { ogType: "article", jsonLd: [articleLd] });
}

// ---------------------------------------------------------------------------
// 운영자(author) 허브
// ---------------------------------------------------------------------------
function renderAuthor(ctx) {
  const cols = [...ctx.PUBLISHED_COLUMNS].sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));
  const cards = cols.map((c) => postCardHtml(ctx, c, "column")).join("");
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["운영자", null]])}
<section class="section">
  <div class="wrap author-hero">
    <span class="owner-seal" aria-hidden="true">${esc(ctx.SITE.owner_name.slice(0, 1))}</span>
    <div>
      <span class="section-eyebrow">운영자 &middot; 편집자</span>
      <h1>${esc(ctx.SITE.owner_name)}</h1>
      <p style="max-width:60ch;color:var(--ink-soft);">${esc(ctx.SITE.owner_bio)}</p>
      <p id="author-state-text" style="font-weight:600;color:var(--brass-dark);">운영자가 정리한 칼럼을 읽어보세요.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <a href="/admin/#column-new" class="btn btn-brass admin-cta">새 칼럼 작성하기</a>
        <a href="#column-list" class="btn btn-outline">칼럼 목록 보기</a>
        <a href="mailto:${ctx.SITE.email}" class="btn btn-outline">이메일 보내기</a>
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
      <div><span class="section-eyebrow">칼럼</span><h2>${esc(ctx.SITE.owner_name)}이(가) 쓴 칼럼</h2></div>
    </div>
    <div class="card-grid">${cards}</div>
  </div>
</section>
`;
  const jsonLd = { "@context": "https://schema.org", "@type": "ProfilePage", mainEntity: { "@type": "Person", name: ctx.SITE.owner_name, description: ctx.SITE.owner_bio } };
  return page(ctx, `운영자 소개 — ${esc(ctx.SITE.owner_name)} | ${ctx.SITE.name}`, `${ctx.SITE.name} 운영자 ${ctx.SITE.owner_name}의 소개와 칼럼 목록입니다.`, "/author/", "/author/", body, { jsonLd });
}

// ---------------------------------------------------------------------------
// 소개(About) / 문의 / 로그인 / 정책 / 404 / 사이트맵
// ---------------------------------------------------------------------------
function renderAbout(ctx) {
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["사이트 소개", null]])}
<section class="section">
  <div class="wrap prose">
    <span class="section-eyebrow">사이트 소개</span>
    <h1>${esc(ctx.SITE.name)}는 이런 사이트입니다</h1>
    <p>${esc(ctx.SITE.name)}는 ${esc(ctx.SITE.audience)}를 대상으로, 한국사와 세계사의 핵심 흐름을 쉬운 언어로 정리해 전달하는 정보 사이트입니다.
    특정 시험이나 자격을 위한 요약 노트가 아니라, 역사를 처음 접하거나 다시 관심을 갖게 된 분들이 편하게 읽을 수 있는 글을 지향합니다.</p>

    <h2>다루는 주제</h2>
    <ul>
      ${ctx.CATEGORIES.map((c) => `<li><strong>${esc(c.name)}</strong> — ${esc(c.desc)}</li>`).join("")}
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
    <p>${esc(ctx.SITE.name)}는 ${ownerLink(ctx)}이(가) 기획과 편집을 맡아 운영하고 있습니다. 정보형 글 외에 운영자의 관점을 담은
    <a href="/columns/">칼럼</a> 코너도 함께 운영합니다.</p>

    <div class="notice-band">이 사이트는 소규모로 운영되는 정보 사이트이며, 전문 연구 기관이나 학술 기관이 아닙니다.
    보다 정확하고 깊이 있는 내용이 필요하다면 관련 도서나 학술 자료를 함께 참고하시길 권장합니다.</div>

    <p><a href="/author/" class="btn btn-outline btn-sm">운영자 소개 자세히 보기 →</a></p>
  </div>
</section>
`;
  return page(ctx, `사이트 소개 — ${ctx.SITE.name}`, `${ctx.SITE.name}가 다루는 주제와 편집 원칙, 운영 방식을 소개합니다.`, "/about/", "/about/", body);
}

function renderContact(ctx) {
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["문의하기", null]])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">문의하기</span>
    <h1>궁금한 점이나 제안을 보내주세요</h1>
    <p class="section-desc" style="max-width:60ch;">오탈자 제보, 다루었으면 하는 주제 제안, 기타 문의 모두 이메일로 받고 있습니다.
    아래 폼을 작성해 보내주시거나, 이메일로 직접 연락해 주셔도 됩니다.</p>

    <div class="notice-band">이 문의 폼은 실제 메일 전송 기능이 연결되어 있지 않은 데모 화면입니다. 문의 내용은
    <a href="mailto:${ctx.SITE.email}">${esc(ctx.SITE.email)}</a>로 직접 보내주시면 확인 후 답변드립니다.</div>

    <form class="form-grid" id="contact-form" onsubmit="return false;">
      <div class="field"><label for="c-name">이름</label><input type="text" id="c-name" placeholder="홍길동"></div>
      <div class="field"><label for="c-email">답변받을 이메일</label><input type="email" id="c-email" placeholder="example@email.com"></div>
      <div class="field"><label for="c-subject">제목</label><input type="text" id="c-subject" placeholder="문의 제목을 입력해 주세요"></div>
      <div class="field"><label for="c-body">내용</label><textarea id="c-body" rows="6" placeholder="문의하실 내용을 자유롭게 작성해 주세요."></textarea></div>
      <a href="mailto:${ctx.SITE.email}?subject=%5B${encodeURIComponent(ctx.SITE.name)}%20문의%5D" class="btn btn-primary" style="width:fit-content;">이메일로 문의 보내기</a>
    </form>
  </div>
</section>
`;
  return page(ctx, `문의하기 — ${ctx.SITE.name}`, `${ctx.SITE.name}에 문의하거나 제안을 보내는 방법을 안내합니다.`, "/contact/", "/contact/", body);
}

function renderLogin(ctx) {
  const body = `
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
`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
${head(ctx, "관리자 로그인 — " + ctx.SITE.name, "관리자 전용 로그인 페이지입니다.", "/login/", "website", null, true)}
</head>
<body>
${headerHtml(ctx, "/login/")}
<main id="main">
${body}
</main>
${footerHtml(ctx)}
<script src="/assets/js/login.js"></script>
</body>
</html>`;
}

function renderPrivacy(ctx) {
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["개인정보처리방침", null]])}
<section class="section">
  <div class="wrap prose">
    <span class="section-eyebrow">정책</span>
    <h1>개인정보처리방침</h1>
    <p>${esc(ctx.SITE.name)}(이하 '사이트')는 이용자의 개인정보를 소중히 여기며, 관련 법령을 준수하기 위해 노력합니다.
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
    <p>개인정보 관련 문의는 <a href="mailto:${ctx.SITE.email}">${esc(ctx.SITE.email)}</a>로 연락해 주시기 바랍니다.</p>

    <h2>7. 방침의 변경</h2>
    <p>본 방침은 관련 법령이나 사이트 운영 방식의 변화에 따라 개정될 수 있으며, 변경 시 이 페이지를 통해 안내합니다.</p>
  </div>
</section>
`;
  return page(ctx, `개인정보처리방침 — ${ctx.SITE.name}`, `${ctx.SITE.name}의 개인정보 수집, 이용, 보관에 관한 정책을 안내합니다.`, "/privacy/", null, body);
}

function renderTerms(ctx) {
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["이용약관", null]])}
<section class="section">
  <div class="wrap prose">
    <span class="section-eyebrow">정책</span>
    <h1>이용약관</h1>
    <p>본 약관은 ${esc(ctx.SITE.name)}(이하 '사이트')가 제공하는 콘텐츠 이용에 관한 기본적인 사항을 정합니다.</p>

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
    <p>약관과 관련한 문의는 <a href="mailto:${ctx.SITE.email}">${esc(ctx.SITE.email)}</a>로 연락해 주시기 바랍니다.</p>
  </div>
</section>
`;
  return page(ctx, `이용약관 — ${ctx.SITE.name}`, `${ctx.SITE.name} 콘텐츠 이용에 관한 기본 약관을 안내합니다.`, "/terms/", null, body);
}

function renderDisclaimer(ctx) {
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["면책고지", null]])}
<section class="section">
  <div class="wrap prose">
    <span class="section-eyebrow">정책</span>
    <h1>면책고지</h1>
    <p>${esc(ctx.SITE.name)}는 ${esc(ctx.SITE.audience)}를 위해 역사 관련 정보를 알기 쉽게 정리해 제공하는 개인 운영 정보
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
    <p>내용에서 사실과 다른 부분을 발견하시면 <a href="mailto:${ctx.SITE.email}">${esc(ctx.SITE.email)}</a>로 알려주시기
    바랍니다. 확인 후 필요한 경우 수정하겠습니다.</p>

    <h2>5. 외부 링크</h2>
    <p>사이트에는 참고를 위한 외부 링크가 포함될 수 있으며, 외부 사이트의 콘텐츠에 대해서는 운영자가 관리 권한을
    갖지 않습니다.</p>
  </div>
</section>
`;
  return page(ctx, `면책고지 — ${ctx.SITE.name}`, `${ctx.SITE.name} 콘텐츠의 성격과 정확성에 관한 면책 사항을 안내합니다.`, "/disclaimer/", null, body);
}

function render404(ctx) {
  const body = `
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
`;
  return page(ctx, `페이지를 찾을 수 없습니다 — ${ctx.SITE.name}`, "요청하신 페이지를 찾을 수 없습니다.", "/404.html", null, body, { noindex: true });
}

function renderSitemapHtml(ctx) {
  const postLinks = [...ctx.PUBLISHED_POSTS].sort((a, b) => (a.published || "").localeCompare(b.published || ""))
    .map((p) => `<li><a href="/posts/${p.slug}/">${esc(p.title)}</a></li>`).join("");
  const colLinks = [...ctx.PUBLISHED_COLUMNS].sort((a, b) => (a.published || "").localeCompare(b.published || ""))
    .map((c) => `<li><a href="/columns/${c.slug}/">${esc(c.title)}</a></li>`).join("");
  const catLinks = ctx.CATEGORIES.map((c) => `<li><a href="/categories/${c.slug}/">${esc(c.name)}</a></li>`).join("");
  const body = `
${breadcrumbHtml(ctx, [["홈", "/"], ["사이트맵", null]])}
<section class="section">
  <div class="wrap">
    <span class="section-eyebrow">사이트맵</span>
    <h1>전체 페이지 한눈에 보기</h1>
    <div class="sitemap-grid" style="margin-top:24px;">
      <div>
        <h2>카테고리</h2>
        <ul>${catLinks}</ul>
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
        <h2>전체 글 (${ctx.PUBLISHED_POSTS.length})</h2>
        <ul>${postLinks}</ul>
        <h2 style="margin-top:24px;">전체 칼럼 (${ctx.PUBLISHED_COLUMNS.length})</h2>
        <ul>${colLinks}</ul>
      </div>
    </div>
  </div>
</section>
`;
  return page(ctx, `사이트맵 — ${ctx.SITE.name}`, `${ctx.SITE.name}의 모든 페이지를 한눈에 볼 수 있는 사이트맵입니다.`, "/sitemap/", null, body);
}

function renderRobotsTxt(ctx) {
  return `User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${ctx.SITE.url.replace(/\/+$/, "")}/sitemap.xml
`;
}

function renderSitemapXml(ctx) {
  const urls = ["/", "/about/", "/author/", "/contact/", "/categories/", "/columns/", "/privacy/", "/terms/", "/disclaimer/", "/sitemap/"];
  ctx.CATEGORIES.forEach((c) => urls.push(`/categories/${c.slug}/`));
  ctx.PUBLISHED_POSTS.forEach((p) => urls.push(`/posts/${p.slug}/`));
  ctx.PUBLISHED_COLUMNS.forEach((c) => urls.push(`/columns/${c.slug}/`));

  function lastmodFor(u) {
    const p = ctx.PUBLISHED_POSTS.find((p) => u === `/posts/${p.slug}/`);
    if (p) return p.modified;
    const c = ctx.PUBLISHED_COLUMNS.find((c) => u === `/columns/${c.slug}/`);
    if (c) return c.modified;
    return "2026-08-01";
  }

  const items = urls.map((u) => `  <url><loc>${ctx.SITE.url.replace(/\/+$/, "")}${u}</loc><lastmod>${lastmodFor(u)}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

function renderAdmin(ctx) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
${head(ctx, "관리자 모드 — " + ctx.SITE.name, "관리자 전용 콘텐츠 관리 화면입니다.", "/admin/", "website", null, true)}
<link href="https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css" rel="stylesheet">
</head>
<body>
<div id="admin-root"></div>
<script src="https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.min.js"></script>
<script src="/assets/js/common.js"></script>
<script src="/assets/js/admin.js"></script>
</body>
</html>`;
}

export {
  esc, fmtDate, isPublished, cat, postBySlug, colBySlug, postsInCat,
  renderHome, renderCategoriesList, renderCategoryDetail, renderPostDetail,
  renderColumnsList, renderColumnDetail, renderAuthor, renderAbout, renderContact,
  renderLogin, renderPrivacy, renderTerms, renderDisclaimer, render404,
  renderSitemapHtml, renderRobotsTxt, renderSitemapXml, renderAdmin,
};
